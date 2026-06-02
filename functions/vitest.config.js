// ---------------------------------------------------------------------------
// functions/vitest.config.js — Vitest-konfiguration for scoring/standings-tests.
// Kører UDEN emulator (ingen Firebase-afhængigheder).
// ---------------------------------------------------------------------------

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'scoring.test.js',
      'standings.test.js',
    ],
    exclude: [
      'rules.test.js',
      'node_modules/**',
    ],
    testTimeout: 10000,
  },
});
