// The page: handles logins, shows what is connected, runs donations through the pipeline, and
// moves everything into an OBS panel on request. Everything shown comes from `state` via render().
import { createDonationAlerts, daLoginUrl } from './donationalerts.js';
import { detectLanguage, getLanguage, hasKey, setLanguage, t } from './i18n.js';
import { createPipeline } from './pipeline.js';
import { createSpotify, exchangeSpotifyCode, randomString, spotifyLoginUrl } from './spotify.js';
import { cleanSettings, createStore, createTokens } from './storage.js';

window.songRequestsStarted = true;

const LOCK_NAME = 'song-donations';
const MAX_ACTIVITY = 100;
const RECHECK_MS = 15_000;
const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const SERVICE_NAMES = { donationalerts: 'DonationAlerts', spotify: 'Spotify', relay: 'relay' };
const SPOTIFY_REFUSALS = ['spotify_forbidden', 'premium'];

const $ = (id) => document.getElementById(id);
const store = createStore();
const tokens = createTokens(store);
const inObs = Boolean(window.obsstudio);

const state = {
  active: false, // this tab holds the lock and does the work
  otherTab: false,
  da: { state: 'off' },
  sp: { state: 'off' },
  player: { state: 'off' },
  activity: [],
  notices: [],
  obsLink: null,
  clientIdError: false,
};

let config;
let settings;
let spotify;
let daClient = null;
let pipeline;
let recheckTimer = null;
let generation = 0; // bumped on log out, so answers to older requests are ignored
let lastDaError = '';
let noticeId = 0;
let logoutArmed = null;

// ---------- small helpers ----------

function pageUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function session(key, value) {
  try {
    if (value === undefined) {
      const raw = sessionStorage.getItem(`song-donations:${key}`);
      sessionStorage.removeItem(`song-donations:${key}`);
      return raw == null ? null : JSON.parse(raw);
    }
    sessionStorage.setItem(`song-donations:${key}`, JSON.stringify(value));
  } catch {
    // Without sessionStorage the login check below fails safely ("try again").
  }
  return null;
}

function spotifyClientId() {
  return config.spClientId || store.get('spotifyClientId') || '';
}

function serviceName(service) {
  return SERVICE_NAMES[String(service ?? '').toLowerCase()] ?? service ?? '';
}

function errorText(error) {
  if (!error) return '';
  const params = { ...error.params };
  if (error.code === 'network' && String(params.service).toLowerCase() === 'relay') return t('error.network.relay');
  if (error.code && hasKey(`error.${error.code}`)) {
    const text = t(`error.${error.code}`, { ...params, service: serviceName(params.service) });
    // A Spotify 403 has several causes (account not on the User Management list, the app owner's
    // Premium lapsed); Spotify's own message says which.
    const spotifySays = SPOTIFY_REFUSALS.includes(error.code) && params.detail && params.detail !== 'no details';
    return spotifySays ? `${text} ${t('error.spotifySays', { detail: params.detail })}` : text;
  }
  return error.message || String(error);
}

function reasonText(reason) {
  if (!reason) return '';
  if (reason.key === 'error') {
    return errorText({ code: reason.params.code, message: reason.params.message, params: reason.params });
  }
  const params = { ...reason.params };
  if (reason.key === 'none_passed' && params.why) params.why = reasonText(params.why);
  return t(`reason.${reason.key}`, params);
}

function formatTime(time) {
  return new Date(time).toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit' });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function base64urlEncode(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

async function copyField(fieldId, button) {
  const field = $(fieldId);
  let copied = false;
  try {
    await navigator.clipboard.writeText(field.value);
    copied = true;
  } catch {
    field.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      // The text stays selected so it can be copied by hand.
    }
  }
  if (copied) {
    button.textContent = t('btn.copied');
    setTimeout(() => (button.textContent = t('btn.copy')), 1500);
  }
}

// ---------- notices and activity ----------

function addNotice(key, params = {}, tone = 'info', error = null) {
  state.notices.push({ id: ++noticeId, key, params, tone, error });
  render();
}

function addActivity(entry) {
  state.activity.unshift({ time: Date.now(), ...entry });
  state.activity.length = Math.min(state.activity.length, MAX_ACTIVITY);
}

function addSystem(key, params = {}) {
  addActivity({ kind: 'system', key, params });
  render();
}

// ---------- logins ----------

async function connectDa() {
  const loginState = `da.${randomString(16)}`;
  session('da-login', loginState);
  location.assign(daLoginUrl({ clientId: config.daClientId, redirectUri: pageUrl(), state: loginState }, config.daSite));
}

async function connectSpotify() {
  const clientId = spotifyClientId();
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    state.clientIdError = true;
    render();
    $('sp-client-id').focus();
    return;
  }
  const loginState = `sp.${randomString(16)}`;
  const verifier = randomString(48);
  session('sp-login', { state: loginState, verifier, clientId });
  location.assign(await spotifyLoginUrl({ clientId, redirectUri: pageUrl(), state: loginState, verifier }, config.spAccounts));
}

function finishDaLogin(hash) {
  const expected = session('da-login');
  const returned = hash.get('state');
  // DonationAlerts may leave out `state`; when it is there it must match.
  if (returned && returned !== expected) {
    addNotice('notice.oldLink', {}, 'warn');
    return;
  }
  // Browser logins get no refresh token. If DonationAlerts sends no lifetime, keep the token
  // until DonationAlerts rejects it.
  const seconds = Number(hash.get('expires_in'));
  tokens.save('donationalerts', { access_token: hash.get('access_token'), expires_in: seconds > 0 ? seconds : 10 * 365 * 86_400 });
  addNotice('notice.daConnected', {}, 'ok');
}

async function finishSpotifyLogin(query) {
  const pending = session('sp-login');
  if (!pending || pending.state !== query.get('state')) {
    addNotice('notice.oldLink', {}, 'warn');
    return;
  }
  try {
    const data = await exchangeSpotifyCode({
      clientId: pending.clientId,
      code: query.get('code'),
      redirectUri: pageUrl(),
      verifier: pending.verifier,
      accountsBase: config.spAccounts,
    });
    tokens.save('spotify', data);
    addNotice('notice.spConnected', {}, 'ok');
  } catch (err) {
    addNotice('notice.loginError', { service: 'Spotify' }, 'bad', err);
  }
}

// Only the first load of a given OBS link imports it: OBS opens the same link on every start,
// and by then the saved logins may be newer than the ones in the link.
function importObsBundle(text) {
  let bundle;
  try {
    bundle = JSON.parse(base64urlDecode(text));
  } catch {
    bundle = null;
  }
  if (bundle?.v !== 1 || !Number.isFinite(bundle.created) || typeof bundle.tokens !== 'object') {
    addNotice('notice.obsBad', {}, 'bad');
    return;
  }
  if (bundle.created <= (Number(store.get('obsImported')) || 0)) return;

  for (const service of ['donationalerts', 'spotify']) {
    const entry = bundle.tokens?.[service];
    if (entry?.access_token) tokens.put(service, entry);
  }
  if (bundle.spotifyClientId) store.set('spotifyClientId', bundle.spotifyClientId);
  if (bundle.settings) store.set('settings', cleanSettings(bundle.settings));
  if (bundle.lang) store.set('lang', bundle.lang);
  store.set('obsImported', bundle.created);
  addNotice('notice.obsImported', {}, 'ok');
}

async function handleReturnFromLogin() {
  if (location.hash.length <= 1 && location.search.length <= 1) return;
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  // Clear the address bar first, so tokens and codes do not stay visible or in the history.
  history.replaceState(null, '', pageUrl());

  if (hash.has('obs')) importObsBundle(hash.get('obs'));
  else if (hash.has('access_token')) finishDaLogin(hash);

  const error = hash.get('error') ?? query.get('error');
  if (error) {
    const loginState = hash.get('state') ?? query.get('state') ?? '';
    const service = loginState.startsWith('sp.') ? 'Spotify' : 'DonationAlerts';
    session(service === 'Spotify' ? 'sp-login' : 'da-login'); // forget the pending login
    if (error === 'access_denied') addNotice('notice.cancelled', { service }, 'warn');
    else addNotice('notice.loginError', { service, error: hash.get('error_description') ?? query.get('error_description') ?? error }, 'bad');
  } else if (query.has('code')) {
    await finishSpotifyLogin(query);
  }
}

// ---------- running ----------

function onDaStatus(status) {
  switch (status.state) {
    case 'connecting':
      state.da = { ...state.da, state: 'connecting' };
      break;
    case 'connected':
      state.da = { state: 'connected', user: status.user };
      lastDaError = '';
      addActivity({ kind: 'system', key: 'connected' });
      break;
    case 'lost':
      state.da = { state: 'lost' };
      addActivity({ kind: 'system', key: 'lost' });
      break;
    case 'error': {
      state.da = { ...state.da, state: 'error', error: status.error };
      const text = errorText(status.error);
      if (text !== lastDaError) addActivity({ kind: 'system', key: 'error', error: status.error });
      lastDaError = text;
      break;
    }
    case 'waiting':
      state.da = { ...state.da, state: 'waiting', seconds: status.seconds };
      break;
    case 'expired':
      state.da = { state: 'expired', error: status.error };
      addActivity({ kind: 'system', key: 'expired' });
      break;
    default:
      state.da = { state: 'off' };
  }
  render();
}

function onResult(result) {
  addActivity({ kind: 'result', ...result });
  const params = result.reason?.params ?? {};
  if (params.code === 'no_device') {
    state.player = { state: 'missing' };
    scheduleRecheck(checkPlayer);
  } else if (params.code === 'expired' && params.service === 'spotify') {
    state.sp = { state: 'expired' };
    state.player = { state: 'off' };
  } else if (result.status === 'queued' && state.player.state !== 'ok') {
    checkPlayer();
  }
  render();
}

function scheduleRecheck(task) {
  clearTimeout(recheckTimer);
  if (state.active) recheckTimer = setTimeout(task, RECHECK_MS);
}

async function checkSpotify() {
  clearTimeout(recheckTimer);
  const gen = generation;
  if (!tokens.has('spotify')) {
    state.sp = { state: 'off' };
    state.player = { state: 'off' };
    render();
    return;
  }
  state.sp = { state: 'checking' };
  render();
  try {
    const profile = await spotify.getProfile();
    if (gen !== generation) return;
    state.sp = { state: 'connected', name: profile?.display_name || profile?.id || '' };
  } catch (err) {
    if (gen !== generation) return;
    state.player = { state: 'off' };
    if (err.code === 'expired') {
      state.sp = { state: 'expired' };
    } else {
      state.sp = { state: 'error', error: err };
      if (['network', 'spotify_server', 'rate_limit'].includes(err.code)) scheduleRecheck(checkSpotify);
    }
    render();
    return;
  }
  render();
  await checkPlayer();
}

async function checkPlayer() {
  clearTimeout(recheckTimer);
  if (state.sp.state !== 'connected') return;
  const gen = generation;
  if (!['missing', 'error'].includes(state.player.state)) {
    state.player = { state: 'checking' };
    render();
  }
  try {
    const devices = await spotify.getDevices();
    if (gen !== generation) return;
    const device = devices.find((d) => d.is_active) ?? devices.find((d) => d.id && !d.is_restricted) ?? devices.find((d) => d.id);
    state.player = device ? { state: 'ok', name: device.name, active: Boolean(device.is_active) } : { state: 'missing' };
  } catch (err) {
    if (gen !== generation) return;
    if (err.code === 'expired') {
      state.sp = { state: 'expired' };
      state.player = { state: 'off' };
      render();
      return;
    }
    state.player = { state: 'error', error: err };
  }
  if (state.player.state !== 'ok') scheduleRecheck(checkPlayer);
  render();
}

function startServices() {
  if (!state.active) return;
  if (daClient && tokens.has('donationalerts')) daClient.start();
  checkSpotify();
}

function stopAndForget() {
  generation += 1;
  clearTimeout(recheckTimer);
  daClient?.stop();
  tokens.clear('donationalerts');
  tokens.clear('spotify');
  state.da = { state: 'off' };
  state.sp = { state: 'off' };
  state.player = { state: 'off' };
}

function logout() {
  if (!logoutArmed) {
    logoutArmed = setTimeout(() => {
      logoutArmed = null;
      render();
    }, 5000);
    render();
    return;
  }
  clearTimeout(logoutArmed);
  logoutArmed = null;
  stopAndForget();
  state.obsLink = null;
  addNotice('notice.loggedOut');
}

function moveToObs() {
  const bundle = {
    v: 1,
    created: Date.now(),
    tokens: { donationalerts: tokens.get('donationalerts'), spotify: tokens.get('spotify') },
    spotifyClientId: config.spClientId ? null : store.get('spotifyClientId'),
    settings,
    lang: getLanguage(),
  };
  state.obsLink = `${pageUrl()}#obs=${base64urlEncode(JSON.stringify(bundle))}`;
  stopAndForget();
  render();
  $('obs-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function runTest(dryRun) {
  const text = $('test-text').value.trim();
  if (!text) {
    $('test-text').focus();
    return;
  }
  pipeline.handleDonation(
    { id: `test-${Date.now()}`, username: t('test.donor'), message: text, amount: settings.minAmount, currency: '', test: true },
    { dryRun },
  );
}

// One tab per browser does the work, so a song is never added twice. A waiting tab takes over
// when the working one closes.
function holdLock(onWaiting, onAcquired) {
  const hold = () => {
    onAcquired();
    return new Promise(() => {});
  };
  if (!navigator.locks?.request) {
    onAcquired();
    return;
  }
  navigator.locks
    .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) return hold();
      onWaiting();
      navigator.locks.request(LOCK_NAME, hold).catch(() => {});
      return null;
    })
    .catch(() => onAcquired());
}

// ---------- rendering ----------

function setRow(prefix, tone, status, detail, button) {
  $(`${prefix}-dot`).className = `dot ${tone}`;
  $(`${prefix}-status`).textContent = status;
  const detailNode = $(`${prefix}-detail`);
  detailNode.textContent = detail || '';
  detailNode.hidden = !detail;
  const buttonNode = $(`${prefix}-button`);
  buttonNode.hidden = !button;
  if (button) {
    buttonNode.textContent = t(button.label);
    buttonNode.dataset.action = button.action;
    buttonNode.disabled = !state.active;
  }
}

function renderDa() {
  const da = state.da;
  if (!config.configured || state.otherTab) {
    setRow('da', 'off', t(state.otherTab ? 'da.otherTab' : 'da.notConnected'), '', null);
  } else if (!tokens.has('donationalerts')) {
    setRow('da', 'off', t('da.notConnected'), '', { label: 'btn.connectDa', action: 'connect-da' });
  } else if (da.state === 'connected') {
    setRow('da', 'ok', t('da.connected', { name: da.user || '—' }), '', null);
  } else if (da.state === 'expired') {
    setRow('da', 'bad', t('da.expired'), '', { label: 'btn.reconnect', action: 'connect-da' });
  } else if (da.state === 'waiting') {
    setRow('da', 'warn', t('da.waiting', { seconds: da.seconds }), errorText(da.error), null);
  } else {
    setRow('da', 'warn', t('da.connecting'), errorText(da.error), null);
  }
}

function renderSpotify() {
  const sp = state.sp;
  const connectButton = { label: 'btn.connectSp', action: 'connect-sp' };
  const reconnectButton = { label: 'btn.reconnect', action: 'connect-sp' };
  const hint = config.spClientId ? t('sp.sharedHint') : t('sp.premium');

  if (state.otherTab) setRow('sp', 'off', t('da.otherTab'), '', null);
  else if (!tokens.has('spotify')) setRow('sp', 'off', t('sp.notConnected'), hint, connectButton);
  else if (sp.state === 'connected') setRow('sp', 'ok', t('sp.connected', { name: sp.name || '—' }), '', null);
  else if (sp.state === 'expired') setRow('sp', 'bad', t('error.expired', { service: 'Spotify' }), '', reconnectButton);
  else if (sp.state === 'error') {
    const retryable = ['network', 'spotify_server', 'rate_limit'].includes(sp.error?.code);
    setRow('sp', 'bad', t('sp.checkFailed'), errorText(sp.error), retryable ? { label: 'btn.check', action: 'check-sp' } : reconnectButton);
  } else setRow('sp', 'warn', t('sp.checking'), '', null);

  const showClient = !config.spClientId && !state.otherTab && (!tokens.has('spotify') || ['expired', 'error'].includes(sp.state));
  $('sp-client').hidden = !showClient;
  $('sp-client-error').hidden = !state.clientIdError;
  $('redirect-uri').value = pageUrl();
}

function renderPlayer() {
  const player = state.player;
  const checkButton = { label: 'btn.check', action: 'check-player' };
  if (state.otherTab) setRow('player', 'off', t('da.otherTab'), '', null);
  else if (state.sp.state !== 'connected') setRow('player', 'off', t('player.needSpotify'), '', null);
  else if (player.state === 'ok') setRow('player', 'ok', t(player.active ? 'player.active' : 'player.ok', { name: player.name || '—' }), '', checkButton);
  else if (player.state === 'missing') setRow('player', 'bad', t('player.none'), '', checkButton);
  else if (player.state === 'error') setRow('player', 'warn', t('player.error', { message: errorText(player.error) }), '', checkButton);
  else setRow('player', 'warn', t('player.checking'), '', null);
}

function renderNotices() {
  const box = $('notices');
  box.replaceChildren();
  const fixed = [];
  if (!config.configured) fixed.push({ key: 'notice.notConfigured', tone: 'bad' });
  if (state.otherTab) fixed.push({ key: 'notice.otherTab', tone: 'warn' });

  for (const notice of [...fixed, ...state.notices]) {
    const node = element('div', `notice ${notice.tone}`);
    let text = t(notice.key, notice.params);
    if (notice.error) text = notice.key === 'notice.loginError' ? t(notice.key, { ...notice.params, error: errorText(notice.error) }) : errorText(notice.error);
    node.append(element('p', null, text));
    if (notice.id) {
      const close = element('button', 'close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', t('notice.close'));
      close.addEventListener('click', () => {
        state.notices = state.notices.filter((n) => n.id !== notice.id);
        render();
      });
      node.append(close);
    }
    box.append(node);
  }
}

function renderActivity() {
  const list = $('activity');
  list.replaceChildren();
  $('activity-empty').hidden = state.activity.length > 0;

  for (const entry of state.activity) {
    const item = element('li', 'item');
    const head = element('div', 'item-head');
    head.append(element('span', 'time', formatTime(entry.time)));
    item.append(head);

    if (entry.kind === 'system') {
      item.classList.add('system');
      head.append(element('span', 'sys-text', entry.key === 'error' ? errorText(entry.error) : t(`sys.${entry.key}`, entry.params)));
    } else {
      head.append(element('span', `pill ${entry.status}`, t(`status.${entry.status}`)));
      const who = entry.test ? '' : [entry.donor || t('activity.anonymous'), entry.amountText].filter(Boolean).join(' · ');
      if (who) head.append(element('span', 'who', who));
      if (entry.test) head.append(element('span', 'tag', t('activity.test')));
      if (entry.song) item.append(element('div', 'song', entry.song));
      if (entry.reason) item.append(element('div', 'reason', reasonText(entry.reason)));
      if (entry.message) item.append(element('div', 'message', `“${entry.message.slice(0, 300)}”`));
    }
    list.append(item);
  }
}

function render() {
  const lang = getLanguage();
  document.documentElement.lang = lang;
  document.title = t('title');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  $('lang').setAttribute('aria-label', t('lang.label'));
  if (!config) return;

  renderNotices();
  renderDa();
  renderSpotify();
  renderPlayer();

  const ready = state.active && state.da.state === 'connected' && state.sp.state === 'connected' && state.player.state === 'ok';
  $('ready').hidden = Boolean(state.obsLink) || !config.configured;
  $('ready').classList.toggle('yes', ready);
  $('ready-text').textContent = t(ready ? 'ready.yes' : 'ready.no');

  const canTest = state.active && tokens.has('spotify');
  $('test-dry').disabled = !canTest;
  $('test-queue').disabled = !canTest;

  const isObsCopy = inObs || Boolean(store.get('obsImported'));
  $('obs-card').hidden = isObsCopy && !state.obsLink;
  $('obs-before').hidden = Boolean(state.obsLink);
  $('obs-after').hidden = !state.obsLink;
  $('obs-link').value = state.obsLink ?? '';
  const bothConnected = tokens.has('donationalerts') && tokens.has('spotify');
  $('obs-move').disabled = !state.active || !bothConnected;
  $('obs-need').hidden = bothConnected;

  $('page-text').value = t('help.pageText');
  renderActivity();

  const logoutButton = $('logout');
  logoutButton.hidden = !tokens.has('donationalerts') && !tokens.has('spotify');
  logoutButton.textContent = t(logoutArmed ? 'logout.confirm' : 'btn.logout');
}

// ---------- rules form ----------

function fillRules() {
  $('rule-minAmount').value = settings.minAmount;
  $('rule-blockExplicit').checked = settings.blockExplicit;
  $('rule-maxTrackMinutes').value = settings.maxTrackMinutes;
  $('rule-blockedWords').value = settings.blockedWords.join('\n');
  $('rule-blockedArtists').value = settings.blockedArtists.join('\n');
  $('rule-duplicateWindowMinutes').value = settings.duplicateWindowMinutes;
}

let savedTimer = null;
function saveRules() {
  settings = cleanSettings({
    minAmount: $('rule-minAmount').value,
    blockExplicit: $('rule-blockExplicit').checked,
    maxTrackMinutes: $('rule-maxTrackMinutes').value,
    blockedWords: $('rule-blockedWords').value,
    blockedArtists: $('rule-blockedArtists').value,
    duplicateWindowMinutes: $('rule-duplicateWindowMinutes').value,
  });
  store.set('settings', settings);
  fillRules();
  $('rules-saved').hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('rules-saved').hidden = true), 2500);
}

// ---------- start ----------

function bindEvents() {
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => {
      store.set('lang', setLanguage(button.dataset.lang));
      render();
    });
  }
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', () => copyField(button.dataset.copy, button));
  }
  for (const id of ['da-button', 'sp-button', 'player-button']) {
    $(id).addEventListener('click', (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === 'connect-da') connectDa();
      else if (action === 'connect-sp') connectSpotify();
      else if (action === 'check-sp') checkSpotify();
      else if (action === 'check-player') checkPlayer();
    });
  }
  $('sp-client-id').addEventListener('input', (event) => {
    const value = event.target.value.trim();
    state.clientIdError = value !== '' && !CLIENT_ID_PATTERN.test(value);
    if (CLIENT_ID_PATTERN.test(value) && value !== store.get('spotifyClientId')) {
      store.set('spotifyClientId', value);
      tokens.clear('spotify'); // a login belongs to the Client ID it was made with
    }
    render();
  });
  $('test-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runTest(true);
  });
  $('test-queue').addEventListener('click', () => runTest(false));
  $('rules').addEventListener('change', saveRules);
  $('rules').addEventListener('submit', (event) => event.preventDefault());
  $('obs-move').addEventListener('click', moveToObs);
  $('logout').addEventListener('click', logout);

  // A login finished in another tab of this browser.
  window.addEventListener('storage', (event) => {
    if (state.active && event.key?.startsWith('song-donations:token:')) startServices();
  });
}

function readConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
  let relayUrl = text(c.relayUrl).replace(/\/+$/, '');
  if (relayUrl && !/^https?:\/\//i.test(relayUrl)) relayUrl = `https://${relayUrl}`;
  const endpoints = c.endpoints && typeof c.endpoints === 'object' ? c.endpoints : {};
  const daClientId = text(c.donationAlertsClientId);
  return {
    daClientId,
    spClientId: text(c.spotifyClientId),
    relayUrl,
    configured: Boolean(daClientId && relayUrl),
    // Only for local testing with fake servers.
    daSite: endpoints.daSite,
    daWs: endpoints.daWs,
    spAccounts: endpoints.spotifyAccounts,
    spApi: endpoints.spotifyApi,
  };
}

async function main() {
  if (inObs) document.documentElement.dataset.theme = 'dark';
  setLanguage(detectLanguage(store.get('lang'), navigator.language));
  render();

  try {
    config = readConfig((await import('../config.js')).default);
  } catch (err) {
    $('fatal-text').textContent = t('fatal.config', { message: err.message });
    $('fatal').hidden = false;
    return;
  }

  await handleReturnFromLogin();
  setLanguage(detectLanguage(store.get('lang'), navigator.language));
  settings = cleanSettings(store.get('settings'));

  spotify = createSpotify({
    getClientId: spotifyClientId,
    tokens,
    apiBase: config.spApi,
    accountsBase: config.spAccounts,
    log: (key, params) => addSystem(key, params),
  });
  pipeline = createPipeline({ getSettings: () => settings, spotify, onResult });
  if (config.configured) {
    daClient = createDonationAlerts({
      tokens,
      relayUrl: config.relayUrl,
      siteBase: config.daSite,
      wsUrl: config.daWs,
      onStatus: onDaStatus,
      onDonation: (donation) => pipeline.handleDonation(donation),
      onNotice: (key, params) => addSystem(key, params),
    });
  }

  bindEvents();
  fillRules();
  $('sp-client-id').value = config.spClientId ? '' : store.get('spotifyClientId') ?? '';
  render();

  holdLock(
    () => {
      state.otherTab = true;
      render();
    },
    () => {
      state.active = true;
      state.otherTab = false;
      startServices();
      render();
    },
  );
}

main().catch((err) => {
  $('fatal-text').textContent = `${err?.message ?? err}`;
  $('fatal').hidden = false;
});
