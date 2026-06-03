import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
    // Limit parallelism to avoid exhausting system memory
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, minForks: 1 },
    },
    maxWorkers: 2,
    minWorkers: 1,
        globals: true,
        environment: 'node',
    },
});
