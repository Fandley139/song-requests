// fetch() with a timeout and readable errors, plus the error type the page translates for the user.

// `code` picks the translated message shown on the page; `message` is the English fallback.
export class AppError extends Error {
  constructor(code, message, params = {}) {
    super(message);
    this.code = code;
    this.params = params;
  }
}

// Returns parsed JSON, plain text, or null for an empty body (Spotify's queue answers 204 / empty 200).
export async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Never throws on HTTP errors. Network failures (including requests a site blocks for browsers)
// become an AppError that names the service.
export async function request(url, { method = 'GET', headers = {}, json, form, service = 'the server', timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const init = { method, headers: { Accept: 'application/json', ...headers }, signal: controller.signal };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form !== undefined) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }

  try {
    const res = await fetch(url, init);
    return { status: res.status, ok: res.ok, headers: res.headers, data: await readBody(res) };
  } catch {
    throw new AppError('network', `Could not reach ${service}. Check your internet connection.`, { service });
  } finally {
    clearTimeout(timer);
  }
}

// Pulls a short human-readable reason out of the many error shapes the two APIs use.
export function errorDetail(data) {
  if (data == null || data === '') return 'no details';
  if (typeof data === 'string') {
    return data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'no details';
  }
  if (data.error_description) return `${data.error ? `${data.error}: ` : ''}${data.error_description}`;
  if (data.error?.message) return data.error.reason ? `${data.error.message} (${data.error.reason})` : data.error.message;
  if (typeof data.error === 'string') return data.error;
  if (data.message) return data.message;
  return JSON.stringify(data).slice(0, 200);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
