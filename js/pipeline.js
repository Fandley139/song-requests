// Turns a donation into a queued song: amount check, message parsing, track lookup, filters,
// duplicate check, then Spotify's queue. Donations are processed strictly one at a time.
// Results are structured ({ status, reason: { key, params } }) so the page can show them in any language.
import { extractTrackId } from './parser.js';

export function formatTrack(track) {
  const artists = (track.artists ?? []).map((artist) => artist.name).join(', ');
  return artists ? `${track.name} - ${artists}` : track.name;
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// The streamer's own currency when DonationAlerts sends it, otherwise the donor's amount.
export function donationAmount(donation) {
  for (const value of [donation.amount_in_user_currency, donation.amount]) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

// Returns the reason a track is not allowed ({ key, params }), or null when it passes every filter.
export function checkTrack(track, donation, settings) {
  if (settings.blockExplicit && track.explicit) return { key: 'explicit', params: {} };

  if (track.duration_ms > settings.maxTrackMinutes * 60_000) {
    return { key: 'too_long', params: { duration: formatDuration(track.duration_ms), max: settings.maxTrackMinutes } };
  }

  const artists = (track.artists ?? []).map((artist) => artist.name ?? '');
  const texts = [track.name ?? '', ...artists, donation.message ?? ''].map((text) => String(text).toLocaleLowerCase());
  const word = settings.blockedWords.find((w) => texts.some((text) => text.includes(w.toLocaleLowerCase())));
  if (word) return { key: 'blocked_word', params: { word } };

  const lowerArtists = artists.map((name) => name.trim().toLocaleLowerCase());
  const artist = settings.blockedArtists.find((a) => lowerArtists.includes(a.toLocaleLowerCase()));
  if (artist) return { key: 'blocked_artist', params: { artist } };

  if (track.is_playable === false) return { key: 'not_playable', params: {} };
  return null;
}

// `getSettings` is read for every donation, so changes on the page apply immediately.
export function createPipeline({ getSettings, spotify, onResult = () => {}, now = Date.now }) {
  const lastQueued = new Map(); // track ID -> time it was queued
  let chain = Promise.resolve();

  async function processDonation(donation, dryRun, base) {
    const settings = getSettings();
    const skip = (key, params = {}, song = null) => ({ ...base, status: 'skipped', reason: { key, params }, song });

    // 1. Amount
    const amount = donationAmount(donation);
    if (amount < settings.minAmount) return skip('below_min', { amount, min: settings.minAmount });

    // 2. Message
    const request = extractTrackId(donation.message);
    if (request.type === 'none') return skip('no_request');
    if (request.type === 'unsupported') return skip('unsupported_link');

    // 3 + 4. Track and filters
    let track;
    if (request.type === 'track') {
      track = await spotify.getTrack(request.id);
      if (!track) return skip('no_track_for_link');
      const blocked = checkTrack(track, donation, settings);
      if (blocked) return { ...skip(blocked.key, blocked.params), song: formatTrack(track) };
    } else {
      const results = await spotify.searchTrack(request.query);
      if (results.length === 0) return skip('not_found', { query: request.query });
      track = results.find((candidate) => !checkTrack(candidate, donation, settings));
      if (!track) {
        const first = results[0];
        return skip('none_passed', { count: results.length, first: formatTrack(first), why: checkTrack(first, donation, settings) });
      }
    }
    const song = formatTrack(track);

    // 5. Duplicates
    const windowMs = settings.duplicateWindowMinutes * 60_000;
    for (const [id, time] of lastQueued) if (now() - time >= windowMs) lastQueued.delete(id);
    if (lastQueued.has(track.id)) {
      const minutes = Math.max(1, Math.round((now() - lastQueued.get(track.id)) / 60_000));
      return skip('duplicate', { minutes, window: settings.duplicateWindowMinutes }, song);
    }

    // 6. Queue
    if (dryRun) return { ...base, status: 'dry-run', reason: null, song, track };
    await spotify.queueTrack(track.uri);
    if (windowMs > 0) lastQueued.set(track.id, now());
    return { ...base, status: 'queued', reason: null, song, track };
  }

  async function safeProcess(donation, dryRun) {
    const d = donation && typeof donation === 'object' ? donation : {};
    // DonationAlerts puts the donor's name in `username`; `name` is the alert type ("donation").
    const base = {
      id: d.id,
      donor: d.username || '',
      amountText: [d.amount, d.currency].filter((v) => v != null && v !== '').join(' '),
      message: typeof d.message === 'string' ? d.message : '',
      test: Boolean(d.test),
      dryRun,
      time: now(),
    };
    let result;
    try {
      result = await processDonation(d, dryRun, base);
    } catch (err) {
      result = { ...base, status: 'error', reason: { key: 'error', params: { code: err.code, message: err.message, ...err.params } }, song: null };
    }
    try {
      onResult(result);
    } catch {
      // Showing the result must never break processing.
    }
    return result;
  }

  // Queues the donation behind any still being processed. Never rejects.
  function handleDonation(donation, { dryRun = false } = {}) {
    const result = chain.then(() => safeProcess(donation, dryRun));
    chain = result;
    return result;
  }

  return { handleDonation };
}
