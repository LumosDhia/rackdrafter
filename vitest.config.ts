import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = { '#shared': path.resolve(root, 'src/shared') };

export default defineConfig({
  resolve: { alias },
  test: {
    typecheck: {
      enabled: true,
      include: ['src/**/*.typetest.ts'],
      tsconfig: './tsconfig.typetest.json',
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'shared',
          environment: 'node',
          include: [
            'src/shared/**/*.test.ts',
            'tests/unit/**/*.test.ts',
            'src/lib/**/*.test.ts',
            'src/domain/**/*.test.ts',
          ],
          exclude: ['tests/unit/server/**', 'src/server/**', 'src/client/**'],
          setupFiles: ['src/test/setup-node.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.test.ts', 'tests/unit/server/**/*.test.ts'],
          setupFiles: ['src/test/setup-node.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx', 'src/client/**/*.test.ts', 'src/store/**/*.test.ts'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
