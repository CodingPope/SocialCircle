// Minimal manual mock for sentry-expo used in tests
// Exports no-op functions so tests that mock or import the module won't fail when
// the real native module isn't installed in CI/dev environments.

module.exports = {
  init: () => {},
  Native: {
    captureException: () => {},
    captureMessage: () => {},
  },
  captureException: () => {},
  captureMessage: () => {},
  setExtras: () => {},
  setTags: () => {},
  setUser: () => {},
  setRelease: () => {},
  setDist: () => {},
};
