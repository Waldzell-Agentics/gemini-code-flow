module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/cli.ts' // CLI entry point, tested via E2E
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 45,
      lines: 35,
      statements: 35
    },
    './src/core/gemini-client.ts': {
      branches: 70,
      functions: 100,
      lines: 80,
      statements: 80
    },
    './src/core/memory-manager.ts': {
      branches: 80,
      functions: 90,
      lines: 95,
      statements: 95
    },
    './src/core/task-queue.ts': {
      branches: 80,
      functions: 100,
      lines: 95,
      statements: 95
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 10000, // 10 seconds for async operations
  collectCoverage: false, // Enable with --coverage flag
  verbose: true
};