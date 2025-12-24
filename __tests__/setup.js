// Jest setup file - runs after test framework is installed
// Use this for global test configuration, not for mocks

// Suppress console warnings during tests (optional)
// global.console = {
//   ...console,
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Set default timeout for async operations
jest.setTimeout(10000);

// Global beforeEach for all tests
beforeEach(() => {
  // Clear all mocks between tests for isolation
  jest.clearAllMocks();
});
