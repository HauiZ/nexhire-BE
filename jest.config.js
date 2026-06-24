/** Unit-test config. Picks up *.spec.ts co-located next to source. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@nexhire/shared$': '<rootDir>/packages/shared/src',
    '^@nexhire/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    '^@nexhire/infra$': '<rootDir>/packages/infra/src',
    '^@nexhire/infra/(.*)$': '<rootDir>/packages/infra/src/$1',
  },
  collectCoverageFrom: ['apps/**/*.service.ts', 'packages/*/src/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '\\.module\\.ts$', '/main\\.ts$'],
  coverageDirectory: './coverage',
  // Enforce the service coverage floor once feature services exist:
  // coverageThreshold: { 'apps/**/*.service.ts': { lines: 70 } },
};
