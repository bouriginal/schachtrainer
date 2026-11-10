import { defineConfig } from 'vitest/config'

// Integrationstests mit echtem Stockfish (langsamer, daher getrennt von `npm test`)
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.integration.test.ts'] },
})
