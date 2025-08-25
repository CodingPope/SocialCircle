// src/lib/devDiagnostics.js
// Dev-only diagnostics; never run in production builds
import { Platform } from 'react-native';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { track as trackClient } from '../../lib/analytics';

export async function runFunctionSmokeTests() {
  if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
    return { skipped: true };
  }
  try {
    const functions = getFunctions(getApp(), 'us-central1');

    // getEvents callable
    try {
      const getEvents = httpsCallable(functions, 'getEvents');
      const res = await getEvents({ limit: 1 });
      console.log(
        '[diagnostics] getEvents ok',
        Array.isArray(res?.data?.events) ? res.data.events.length : 'n/a'
      );
      trackClient('diag_getEvents_ok', {
        count: Array.isArray(res?.data?.events) ? res.data.events.length : 0,
      });
    } catch (e) {
      console.warn('[diagnostics] getEvents failed', e?.message || e);
    }

    // sendPush callable with no tokens to validate auth errors/handling
    try {
      const sendPush = httpsCallable(functions, 'sendPush');
      const res = await sendPush({ title: 'Smoke', body: 'Test', tokens: [] });
      console.log('[diagnostics] sendPush ok', res?.data || {});
      trackClient('diag_sendPush_ok', {});
    } catch (e) {
      console.warn(
        '[diagnostics] sendPush failed (expected if not authed?)',
        e?.message || e
      );
    }
    return { ok: true };
  } catch (e) {
    console.warn('[diagnostics] unexpected error', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
