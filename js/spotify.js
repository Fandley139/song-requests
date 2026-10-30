// Spotify Web API from the browser: PKCE login (no client secret), search, track lookup, devices,
// and adding songs to the queue.
import { AppError, errorDetail, request, sleep as defaultSleep } from './http.js';

export const SPOTIFY_SCOPES = 'user-modify-playback-state user-read-playback-state';
const ACCOUNTS_BASE = 'https://accounts.spotify.com';
const API_BASE = 'https://api.spotify.com/v1';

function base64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteCount = 32) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function spotifyLoginUrl({ clientId, redirectUri, state, verifier }, accountsBase = ACCOUNTS_BASE) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: await pkceChallenge(verifier),
  });
  return `${accountsBase}/authorize?${params.toString().replace(/\+/g, '%20')}`;
}

async function tokenRequest(accountsBase, form) {
  const res = await request(`${accountsBase}/api/token`, { method: 'POST', form, service: 'Spotify' });
  if (res.ok && res.data?.access_token) return res.data;

  const code = res.data?.error;
  if (code === 'invalid_client') {
    throw new AppError('spotify_bad_client', 'Spotify does not accept this Client ID. Check it, and that the Spotify app has this page as its redirect URI.');
  }
  if (code === 'invalid_grant' && form.grant_type === 'refresh_token') {
    throw new AppError('expired', 'The Spotify login has expired. Connect Spotify again.', { service: 'spotify' });
  }
  if (code === 'invalid_grant') throw new AppError('login_failed', 'Spotify rejected the login. Try connecting again.', { service: 'spotify' });
  throw new AppError('login_failed', `Spotify login failed (HTTP ${res.status}: ${errorDetail(res.data)}).`, { service: 'spotify' });
}

export function exchangeSpotifyCode({ clientId, code, redirectUri, verifier, accountsBase = ACCOUNTS_BASE }) {
  return tokenRequest(accountsBase, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
}

function retryAfterSeconds(header) {
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const date = Date.parse(header ?? '');
  return Number.isNaN(date) ? 1 : Math.max(1, Math.ceil((date - Date.now()) / 1000));
}

export function createSpotify({
  getClientId,
  tokens,
  apiBase = API_BASE,
  accountsBase = ACCOUNTS_BASE,
  log = () => {},
  sleep = defaultSleep,
  maxRetryAfterSeconds = 60,
}) {
  const refresh = (refreshToken) =>
    tokenRequest(accountsBase, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: getClientId() });

  function getAccessToken(options) {
    return tokens.getAccessToken('spotify', refresh, options);
  }

  function send(path, method, json, token) {
    return request(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, json, service: 'Spotify' });
  }

  // Adds the Bearer token, retries once after a token refresh on 401, and once after waiting
  // for Retry-After on 429. Returns { status, ok, data } so callers can handle specific errors.
  async function spotifyFetch(path, { method = 'GET', json } = {}) {
    let res = await send(path, method, json, await getAccessToken());
    if (res.status === 401) res = await send(path, method, json, await getAccessToken({ force: true }));
    if (res.status === 429) {
      const wait = retryAfterSeconds(res.headers.get('retry-after'));
      if (wait > maxRetryAfterSeconds) {
        throw new AppError('rate_limit', `Spotify asked to pause for about ${Math.ceil(wait / 60)} minutes. Try again later.`, { minutes: Math.ceil(wait / 60) });
      }
      log('spotify_busy', { seconds: wait });
      await sleep(wait * 1000);
      res = await send(path, method, json, await getAccessToken());
    }
    return res;
  }

  function failure(res) {
    const detail = errorDetail(res.data);
    if (res.status === 401) return new AppError('expired', 'Spotify rejected the login. Connect Spotify again.', { service: 'spotify' });
    if (res.status === 403) return new AppError('spotify_forbidden', `Spotify refused (HTTP 403: ${detail}).`, { detail });
    if (res.status === 429) return new AppError('rate_limit', 'Spotify is still busy. Try again in a few minutes.', { minutes: 2 });
    if (res.status >= 500) return new AppError('spotify_server', `Spotify had a server problem (HTTP ${res.status}). Try again in a minute.`);
    return new AppError('spotify_error', `Spotify answered HTTP ${res.status}: ${detail}.`, { status: res.status, detail });
  }

  // market=from_token picks the user's country. If Spotify answers 400 about the market, retry
  // once without it (Spotify then uses the account's country anyway).
  async function withMarketFallback(path, params) {
    const url = (query) => {
      const qs = new URLSearchParams(query).toString();
      return qs ? `${path}?${qs}` : path;
    };
    const res = await spotifyFetch(url({ ...params, market: 'from_token' }));
    if (res.status === 400 && /market/i.test(errorDetail(res.data))) return spotifyFetch(url(params));
    return res;
  }

  async function searchTrack(query) {
    const res = await withMarketFallback('/search', { q: query, type: 'track', limit: '5' });
    if (!res.ok) throw failure(res);
    return (res.data?.tracks?.items ?? []).filter(Boolean);
  }

  // Returns null when Spotify has no track with this ID.
  async function getTrack(id) {
    const res = await withMarketFallback(`/tracks/${encodeURIComponent(id)}`, {});
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw failure(res);
    return res.data;
  }

  async function getDevices() {
    const res = await spotifyFetch('/me/player/devices');
    if (!res.ok) throw failure(res);
    return res.data?.devices ?? [];
  }

  async function getProfile() {
    const res = await spotifyFetch('/me');
    if (!res.ok) throw failure(res);
    return res.data;
  }

  const isNoActiveDevice = (res) =>
    res.status === 404 && (res.data?.error?.reason === 'NO_ACTIVE_DEVICE' || /active device/i.test(errorDetail(res.data)));

  async function queueTrack(uri) {
    const path = `/me/player/queue?uri=${encodeURIComponent(uri)}`;
    let res = await spotifyFetch(path, { method: 'POST' });

    if (isNoActiveDevice(res)) {
      const devices = await getDevices();
      const device = devices.find((d) => d.id && !d.is_restricted) ?? devices.find((d) => d.id);
      if (!device) throw new AppError('no_device', 'No Spotify player is open. Open Spotify on this computer or phone and press play once.');

      log('switch_device', { name: device.name });
      await spotifyFetch('/me/player', { method: 'PUT', json: { device_ids: [device.id], play: false } });
      await sleep(1000);
      res = await spotifyFetch(path, { method: 'POST' });
      if (isNoActiveDevice(res)) throw new AppError('no_device', 'No Spotify player is open. Open Spotify on this computer or phone and press play once.');
    }

    if (res.status === 403) {
      throw new AppError('premium', `Spotify refused to add the song (HTTP 403: ${errorDetail(res.data)}). Spotify Premium is required, or this account is not allowed to use the Spotify app.`, { detail: errorDetail(res.data) });
    }
    if (!res.ok) throw failure(res);
  }

  return { getAccessToken, searchTrack, getTrack, getDevices, getProfile, queueTrack };
}
