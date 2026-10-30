// Finds a Spotify track link or URI, or a text search query, in a donation message. Pure functions.

const ID = String.raw`([A-Za-z0-9]{22})(?![A-Za-z0-9])`;
const OPEN_SPOTIFY = String.raw`(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]+)?\/)?(?:embed\/)?`;

const TRACK_URL = new RegExp(`${OPEN_SPOTIFY}track\\/${ID}`, 'i');
const TRACK_URI = new RegExp(`spotify:track:${ID}`, 'i');
const OTHER_URL = new RegExp(`${OPEN_SPOTIFY}(?:album|playlist|artist|episode|show|user)\\/`, 'i');
const OTHER_URI = /spotify:(?:album|playlist|artist|episode|show|user):/i;
const URLS = /(?:https?:\/\/|www\.)\S+|open\.spotify\.com\/\S*|spotify:[a-z]+:\S+/gi;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// Returns { type: 'track', id } | { type: 'unsupported' } | { type: 'text', query } | { type: 'none' }.
export function extractTrackId(message) {
  const text = typeof message === 'string' ? message : '';

  const match = text.match(TRACK_URL) ?? text.match(TRACK_URI);
  if (match) return { type: 'track', id: match[1] };
  if (OTHER_URL.test(text) || OTHER_URI.test(text)) return { type: 'unsupported' };

  const query = text.replace(URLS, ' ').replace(/\s+/g, ' ').trim();
  // Messages with no letters or digits (only emoji or punctuation) are not song requests.
  return HAS_LETTER_OR_DIGIT.test(query) ? { type: 'text', query } : { type: 'none' };
}
