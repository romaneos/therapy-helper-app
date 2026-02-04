export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'js/services/**/*.js',
    '!js/services/**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  injectGlobals: true
};
