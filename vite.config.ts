import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { defineConfig } from 'vitest/config';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig(({ mode }) => {
  const base = normalizeBasePath(loadEnv(mode, '.', 'VITE_').VITE_BASE_PATH);
  return {
    base,
    define: {
      CESIUM_BASE_URL: JSON.stringify(`${base}${cesiumBaseUrl}`),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: `${cesiumSource}/ThirdParty`,
            dest: cesiumBaseUrl,
            rename: { stripBase: 4 },
          },
          {
            src: `${cesiumSource}/Workers`,
            dest: cesiumBaseUrl,
            rename: { stripBase: 4 },
          },
          {
            src: `${cesiumSource}/Assets`,
            dest: cesiumBaseUrl,
            rename: { stripBase: 4 },
          },
          {
            src: `${cesiumSource}/Widgets`,
            dest: cesiumBaseUrl,
            rename: { stripBase: 4 },
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: true,
    },
  };
});

function normalizeBasePath(value: string | undefined): string {
  if (!value) return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}
