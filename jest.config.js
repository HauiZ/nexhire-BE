module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['apps/**/*.service.ts', 'packages/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@nexhire/shared$': '<rootDir>/packages/shared/src',
    '^@nexhire/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
  },
};
