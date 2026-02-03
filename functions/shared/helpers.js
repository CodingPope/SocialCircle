// Shared helper utilities for Cloud Functions

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

function truncate(text, max = 160) {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function incrementCounter(target, key) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = 0;
  }
  target[key] += 1;
}

module.exports = {
  toDate,
  truncate,
  incrementCounter,
};

