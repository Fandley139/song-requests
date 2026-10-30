// Keeps logins and settings in this browser (localStorage). Every browser, and OBS, has its own copy.
import { AppError } from './http.js';

const PREFIX = 'song-donations:';
const NAMES = { donationalerts: 'DonationAlerts', spotify: 'Spotify' };
const REFRESH_MARGIN_MS = 60_000;

export function memoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

// Storage can be missing or blocked (private windows, strict settings); the page then simply forgets.
export function createStore(backend = globalThis.localStorage) {
  return {
    get(key) {
      try {
        const raw = backend.getItem(PREFIX + key);
        return raw == null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Nothing to do: the value just is not remembered.
      }
    },
    remove(key) {
      try {
        backend.removeItem(PREFIX + key);
      } catch {
        // Same as above.
      }
    },
  };
}

// Login tokens with an absolute expiry time, refreshed when they expire within 60 seconds.
export function createTokens(store) {
  const refreshing = new Map();
  const get = (service) => store.get(`token:${service}`);

  // Keeps the old refresh token when the response has none.
  function save(service, response) {
    const previous = get(service);
    const seconds = Number(response.expires_in);
    const entry = {
      access_token: response.access_token,
      refresh_token: response.refresh_token || previous?.refresh_token || null,
      expires_at: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000,
    };
    store.set(`token:${service}`, entry);
    return entry;
  }

  // Parallel callers share a single refresh request. `refresh` is null when the service gives no
  // refresh token (DonationAlerts in the browser): the user then connects again.
  async function getAccessToken(service, refresh, { force = false } = {}) {
    const current = get(service);
    if (!current?.access_token) {
      throw new AppError('not_connected', `${NAMES[service]} is not connected.`, { service });
    }
    if (!force && current.expires_at - Date.now() > REFRESH_MARGIN_MS) return current.access_token;
    if (!refresh || !current.refresh_token) {
      throw new AppError('expired', `The ${NAMES[service]} login has expired. Connect it again.`, { service });
    }
    if (!refreshing.has(service)) {
      const task = (async () => {
        try {
          return save(service, await refresh(current.refresh_token)).access_token;
        } finally {
          refreshing.delete(service);
        }
      })();
      refreshing.set(service, task);
    }
    return refreshing.get(service);
  }

  return {
    get,
    save,
    getAccessToken,
    has: (service) => Boolean(get(service)?.access_token),
    clear: (service) => store.remove(`token:${service}`),
    // Raw entry, used to move logins into OBS.
    put: (service, entry) => store.set(`token:${service}`, entry),
  };
}

export const DEFAULT_SETTINGS = {
  minAmount: 1,
  blockExplicit: true,
  maxTrackMinutes: 8,
  blockedWords: [],
  blockedArtists: [],
  duplicateWindowMinutes: 60,
};

// Fills gaps and fixes types, so a damaged saved value can never break the pipeline.
export function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const number = (value, fallback, min) => (Number.isFinite(Number(value)) && Number(value) >= min ? Number(value) : fallback);
  const list = (value) =>
    (Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/))
      .map((item) => String(item).trim())
      .filter(Boolean);
  return {
    minAmount: number(s.minAmount, DEFAULT_SETTINGS.minAmount, 0),
    blockExplicit: Boolean(s.blockExplicit),
    maxTrackMinutes: number(s.maxTrackMinutes, DEFAULT_SETTINGS.maxTrackMinutes, 0.1),
    blockedWords: list(s.blockedWords),
    blockedArtists: list(s.blockedArtists),
    duplicateWindowMinutes: number(s.duplicateWindowMinutes, DEFAULT_SETTINGS.duplicateWindowMinutes, 0),
  };
}
