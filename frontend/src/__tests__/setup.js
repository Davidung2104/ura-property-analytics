import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = vi.fn();

// Suppress console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('React Router')) return;
  originalWarn(...args);
};

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, val) => { store[key] = val; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => Object.keys(store).forEach(k => delete store[k])),
};

// Reset mocks between tests
afterEach(() => {
  vi.restoreAllMocks();
  Object.keys(store).forEach(k => delete store[k]);
});
