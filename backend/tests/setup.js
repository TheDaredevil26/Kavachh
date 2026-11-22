'use strict';

// Jest setup file — runs after the test framework is installed.
// Add any global test helpers or cleanup here.

// Increase default timeout for integration tests
jest.setTimeout(15000);

// Suppress noisy logs during tests
process.env.LOG_LEVEL = 'error';
process.env.NODE_ENV = 'test';

afterAll(async () => {
  // Give open handles (Redis, Mongo, etc.) a moment to close
  await new Promise((resolve) => setTimeout(resolve, 500));
});
