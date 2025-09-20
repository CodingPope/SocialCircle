import { event as analyticsEvent } from './analytics';
import {
  trackOnboardingStepComplete,
  trackOnboardingDone,
} from '../lib/analytics';

function safePayload(extra = {}) {
  const out = {};
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value == null) return;
    const lower = key.toLowerCase();
    if (lower.includes('name') || lower.includes('email')) return;
    out[key] = value;
  });
  return out;
}

export async function logOnboardingStepComplete(step, extra) {
  if (!step) return;
  const payload = { step, ...safePayload(extra) };
  try {
    await analyticsEvent('onboarding_step_complete', payload);
  } catch {}
  try {
    await trackOnboardingStepComplete(payload);
  } catch {}
}

export async function logOnboardingDone(extra) {
  const payload = safePayload(extra);
  try {
    await analyticsEvent('onboarding_done', payload);
  } catch {}
  try {
    await trackOnboardingDone(payload);
  } catch {}
}

export default { logOnboardingStepComplete, logOnboardingDone };
