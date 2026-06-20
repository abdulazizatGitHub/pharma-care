import type { Config } from 'jest'

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/*.test.ts'],
  setupFiles: ['<rootDir>/tests/helpers/setup.ts'],
  testTimeout: 30000,
  verbose: true,
} satisfies Config
