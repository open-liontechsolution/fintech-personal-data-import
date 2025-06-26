import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set default test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock external services in tests
jest.setTimeout(30000);

// Global test teardown
afterAll(async () => {
  // Add any global cleanup here
});
