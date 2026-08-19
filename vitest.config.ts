import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
    // Limit parallelism to avoid exhausting system memory
    // Vitest 4 removed `test.poolOptions`; these are top-level options now.
    // Nested under poolOptions they were silently ignored, leaving only
    // maxWorkers in force.
    pool: 'forks',
    maxForks: 2,
    minForks: 1,
    maxWorkers: 2,
    minWorkers: 1,
        globals: true,
        environment: 'node',
    },
});
