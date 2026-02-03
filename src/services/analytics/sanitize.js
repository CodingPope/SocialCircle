// Utilities for privacy-safe analytics parameters

function maskId(value) {
  try {
    const str = String(value || '').trim();
    if (!str) return null;
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // force 32-bit
    }
    const positive = Math.abs(hash);
    return positive.toString(36).slice(0, 16);
  } catch {
    return null;
  }
}

export function sanitize(obj) {
  try {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue;

      const trimmedKey = String(k).trim();
      if (!trimmedKey || trimmedKey.length === 0 || trimmedKey.length > 40)
        continue;
      if (
        trimmedKey.startsWith('_') ||
        trimmedKey.startsWith('firebase_') ||
        trimmedKey.startsWith('google_') ||
        trimmedKey.startsWith('ga_')
      )
        continue;
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedKey)) continue;

      const lower = trimmedKey.toLowerCase();
      if (
        lower.includes('email') ||
        lower.includes('phone') ||
        lower.includes('token') ||
        lower.includes('address') ||
        lower.includes('image') ||
        lower.includes('photo') ||
        lower.includes('name')
      )
        continue;

      if (lower.includes('id')) {
        const masked = maskId(v);
        if (masked) out[trimmedKey] = masked;
        continue;
      }

      if (typeof v === 'number') {
        if (lower.includes('lat') || lower.includes('lng')) {
          out[trimmedKey] = Math.round(v * 10) / 10;
        } else {
          out[trimmedKey] = v;
        }
      } else if (typeof v === 'string') {
        const trimmedValue = v.trim();
        if (trimmedValue.length > 0) {
          out[trimmedKey] = trimmedValue.slice(0, 100);
        }
      } else if (Array.isArray(v)) {
        out[trimmedKey] = v
          .slice(0, 10)
          .map((x) => (typeof x === 'string' ? x.slice(0, 40) : x));
      } else if (typeof v === 'object') {
        out[trimmedKey] = '[object]';
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function toNum(n) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

export function safeStr(s) {
  return typeof s === 'string' ? s.slice(0, 40) : String(s || '');
}

export function maskUserId(value) {
  return maskId(value);
}
