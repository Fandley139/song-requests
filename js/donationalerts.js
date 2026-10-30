// DonationAlerts from the browser: login (implicit grant, no client secret) and the realtime
// donation listener (Centrifugo websocket). The profile request goes through the relay, because
// DonationAlerts does not let browsers call that endpoint directly; everything else is direct.
import { AppError, errorDetail, request } from './http.js';

export const DA_SCOPES = 'oauth-user-show oauth-donation-subscribe';
const SITE_BASE = 'https://www.donationalerts.com';
const WS_URL = 'wss://centrifugo.donationalerts.com/connection/websocket';

export function daLoginUrl({ clientId, redirectUri, state }, siteBase = SITE_BASE) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: DA_SCOPES,
    state,
  });
  return `${siteBase}/oauth/authorize?${params.toString().replace(/\+/g, '%20')}`;
}

// Centrifugo may send several JSON messages in one websocket frame, separated by newlines.
export function parseFrames(raw) {
  return String(raw)
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

// Returns the payload of a publication on `channel`, or null for anything else (command replies,
// join/leave notices). Handles the v2 shape ({ result: { channel, data: { data } } }) and the newer
// { push: { channel, pub: { data } } } shape.
export function channelPublication(frame, channel) {
  const push = frame?.result ?? frame?.push;
  if (!push || typeof push !== 'object' || frame.id || push.channel !== channel) return null;
  if (push.type) return null; // v2 push types: 0 = publication, 1 = join, 2 = leave, ...
  const publication = push.pub ?? push.data;
  return publication == null ? null : publication.data ?? publication;
}

export function toDonation(payload) {
  let d = payload;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  for (let depth = 0; depth < 3 && d && typeof d === 'object' && d.id == null && d.data && typeof d.data === 'object'; depth++) {
    d = d.data;
  }
  if (!d || typeof d !== 'object' || d.id == null) return null;
  return {
    id: d.id,
    name: d.name,
    username: d.username,
    message: d.message,
    amount: d.amount,
    currency: d.currency,
    amount_in_user_currency: d.amount_in_user_currency,
  };
}

// Close reasons arrive as JSON like {"reason":"invalid token","reconnect":false}.
function describeClose(code, reason) {
  let text = String(reason ?? '').trim();
  try {
    text = JSON.parse(text).reason ?? text;
  } catch {
    // Plain text reason.
  }
  return text ? ` (${text})` : code && code !== 1005 && code !== 1006 ? ` (code ${code})` : '';
}

// onStatus receives { state: 'connecting' | 'connected' | 'lost' | 'error' | 'waiting' | 'expired' | 'stopped', ... }.
// Reconnects with exponential backoff until stop(), or until the login expires.
export function createDonationAlerts({
  tokens,
  relayUrl,
  onStatus = () => {},
  onDonation = () => {},
  onNotice = () => {},
  siteBase = SITE_BASE,
  wsUrl = WS_URL,
  WebSocketImpl = globalThis.WebSocket,
  pingIntervalMs = 25_000,
  pongTimeoutMs = 10_000,
  replyTimeoutMs = 15_000,
  tickMs = 5000,
  minBackoffMs = 1000,
  maxBackoffMs = 30_000,
  dedupeSize = 1000,
}) {
  const seenIds = new Set();
  let running = false;
  let attempt = 0;
  let endSession = null;
  let wake = null;

  const getToken = () => tokens.getAccessToken('donationalerts', null);
  const expired = () => new AppError('expired', 'The DonationAlerts login has expired. Connect it again.', { service: 'donationalerts' });

  async function getUser(token) {
    const res = await request(`${relayUrl.replace(/\/+$/, '')}/da-user`, { method: 'POST', json: { token }, service: 'relay' });
    if (res.status === 401) throw expired();
    if (!res.ok) throw new AppError('da_error', `DonationAlerts profile request failed (HTTP ${res.status}: ${errorDetail(res.data)}).`);
    const user = res.data?.data;
    if (!user?.id || !user.socket_connection_token) throw new AppError('da_error', 'DonationAlerts did not return your user ID and connection token.');
    return user;
  }

  async function channelToken(channel, client, token) {
    const res = await request(`${siteBase}/api/v1/centrifuge/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      json: { channels: [channel], client },
      service: 'DonationAlerts',
    });
    if (res.status === 401) throw expired();
    if (!res.ok) throw new AppError('da_error', `DonationAlerts refused the donation channel (HTTP ${res.status}: ${errorDetail(res.data)}).`);
    const entry = res.data?.channels?.find((c) => c.channel === channel);
    if (!entry?.token) throw new AppError('da_error', 'DonationAlerts did not return a token for the donation channel.');
    return entry.token;
  }

  function isNew(id) {
    const key = String(id);
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    if (seenIds.size > dedupeSize) seenIds.delete(seenIds.values().next().value);
    return true;
  }

  // One websocket session. Resolves when a subscribed connection ends; rejects if setup fails.
  function runSession(user, token) {
    const channel = `$alerts:donation_${user.id}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(wsUrl);
      const pending = new Map();
      let nextId = 1;
      let subscribeId = null;
      let subscribed = false;
      let ended = false;
      let lastActivity = Date.now();
      let pingSentAt = null;
      let ticker = null;
      const ignore = () => {};

      const end = (error) => {
        if (ended) return;
        ended = true;
        clearInterval(ticker);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new AppError('connection_lost', 'The connection to DonationAlerts was lost.'));
        }
        pending.clear();
        ws.onopen = ws.onmessage = ws.onclose = ignore;
        ws.onerror = ignore;
        try {
          ws.close();
        } catch {
          // Already closed.
        }
        if (endSession === end) endSession = null;
        if (subscribed) resolve();
        else reject(error ?? new AppError('connection_lost', 'DonationAlerts closed the connection.'));
      };
      endSession = end;

      const send = (payload) => {
        try {
          ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        } catch {
          end(new AppError('connection_lost', 'The connection to DonationAlerts was lost.'));
        }
      };

      const settle = (id, error, result) => {
        const waiter = pending.get(id);
        if (!waiter) return;
        pending.delete(id);
        clearTimeout(waiter.timer);
        if (error) waiter.reject(new AppError('da_error', `DonationAlerts realtime server error: ${error.message ?? 'unknown'} (code ${error.code ?? '?'}).`));
        else waiter.resolve(result ?? {});
      };

      const command = (payload) =>
        new Promise((res, rej) => {
          const id = nextId++;
          const timer = setTimeout(() => {
            pending.delete(id);
            rej(new AppError('da_timeout', 'DonationAlerts did not answer in time.'));
          }, replyTimeoutMs);
          pending.set(id, { resolve: res, reject: rej, timer });
          send({ ...payload, id });
        });

      // Browsers cannot send websocket pings, so use Centrifugo's own ping command (method 7)
      // and reconnect when nothing at all arrives in time.
      const checkAlive = () => {
        const now = Date.now();
        if (pingSentAt && now - pingSentAt > pongTimeoutMs) {
          end(new AppError('connection_lost', 'DonationAlerts stopped answering.'));
        } else if (!pingSentAt && now - lastActivity >= pingIntervalMs) {
          pingSentAt = now;
          send({ method: 7, id: nextId++ });
        }
      };

      ws.onopen = async () => {
        lastActivity = Date.now();
        ticker = setInterval(checkAlive, tickMs);
        try {
          const connected = await command({ params: { token: user.socket_connection_token } });
          if (!connected.client) throw new AppError('da_error', 'DonationAlerts did not send a client ID after connecting.');
          const subscribeToken = await channelToken(channel, connected.client, token);
          subscribeId = nextId;
          await command({ params: { channel, token: subscribeToken }, method: 1 });
          subscribed = true;
          attempt = 0;
          onStatus({ state: 'connected', user: user.name || user.code || '' });
        } catch (err) {
          end(err);
        }
      };

      ws.onmessage = (event) => {
        lastActivity = Date.now();
        pingSentAt = null;
        for (const frame of parseFrames(event.data)) {
          if (Object.keys(frame).length === 0) {
            send('{}'); // server ping in newer Centrifugo protocols
            continue;
          }
          if (frame.id && pending.has(frame.id)) {
            settle(frame.id, frame.error, frame.result);
            continue;
          }
          // The docs show the subscribe confirmation as a join notice without an id.
          const push = frame.result ?? frame.push;
          if (subscribeId && pending.has(subscribeId) && push?.channel === channel && push?.type === 1) {
            settle(subscribeId, null, push);
            continue;
          }
          const payload = channelPublication(frame, channel);
          if (payload == null) continue;
          const donation = toDonation(payload);
          if (!donation) {
            onNotice('bad_message', { sample: JSON.stringify(frame).slice(0, 300) });
          } else if (isNew(donation.id)) {
            try {
              onDonation(donation);
            } catch {
              // Handling errors are reported by the pipeline itself.
            }
          }
        }
      };

      ws.onerror = ignore; // onclose always follows
      ws.onclose = (event) => {
        end(new AppError('connection_lost', `DonationAlerts closed the connection${describeClose(event.code, event.reason)}.`));
      };
    });
  }

  async function loop() {
    while (running) {
      try {
        const token = await getToken();
        onStatus({ state: 'connecting' });
        const user = await getUser(token);
        if (!running) break;
        await runSession(user, token);
        if (running) onStatus({ state: 'lost' });
      } catch (err) {
        if (!running) break;
        if (err.code === 'expired' || err.code === 'not_connected') {
          running = false;
          onStatus({ state: 'expired', error: err });
          return;
        }
        onStatus({ state: 'error', error: err });
      }
      if (!running) break;

      attempt += 1;
      const wait = Math.min(maxBackoffMs, minBackoffMs * 2 ** (attempt - 1));
      onStatus({ state: 'waiting', seconds: Math.max(1, Math.round(wait / 1000)), attempt });
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, wait);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = null;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      loop().catch((err) => onStatus({ state: 'error', error: err }));
    },
    stop() {
      if (!running) return;
      running = false;
      wake?.();
      endSession?.();
      onStatus({ state: 'stopped' });
    },
    isRunning: () => running,
  };
}
