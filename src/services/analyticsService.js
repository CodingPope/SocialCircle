// Description: Privacy-first analytics service.
// - Opt-in required: respects user.analyticsOptIn (false by default)
// - Dynamic import of @react-native-firebase/analytics if available; otherwise no-op
// - Never includes precise PII. Only logs coarse, non-identifying params when enabled
// - Exposes helpers: init, setOptIn, screen, event, identify, isEnabled
// - Automatically includes city-level location context for Firebase Realtime map

export { deriveUserAnalyticsProps } from './analytics/props';
export {
  setTrackingAllowed,
  isEnabled,
  analyticsInit,
  init,
  setOptIn,
  screen,
  event,
  track,
  identify,
  trackJoinEventSafe,
  trackCreateEventSafe,
  trackFilterApplySafe,
} from './analytics/runtime';
