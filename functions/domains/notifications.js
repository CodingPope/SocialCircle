const fetch = require('node-fetch');
const { logger } = require('firebase-functions/v2');

function chunk(arr, size = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Send messages to Expo Push API
async function sendExpoPushMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const chunks = chunk(messages, 100);
  for (const batch of chunks) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('[push] Expo API error', res.status, text);
      continue;
    }

    const json = await res.json().catch(() => ({}));
    const tickets = json?.data || [];
    const hasErrors = tickets.some((t) => t.status === 'error');
    if (hasErrors) logger.error('[push] Expo ticket errors', tickets);
  }
}

module.exports = {
  sendExpoPushMessages,
};

