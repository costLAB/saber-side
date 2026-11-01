import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `pnpm dev:https` serves over a self-signed certificate so an iPad or Quest on the same
// network can open the dev server. WebXR only runs in a secure context.
const https = process.env.HTTPS === '1';

// In dev, the page reaches the local station server (apps/server, port 2567) through /colyseus on its own origin. That
// way it also works over HTTPS: an https page may not open a plain ws:// socket to another port.
const station = {
  '/colyseus': {
    target: 'http://localhost:2567',
    ws: true,
    rewrite: (path: string) => path.replace(/^\/colyseus/, ''),
  },
};

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  server: { host: true, proxy: station },
  preview: { host: true },
  // three.js alone is ~600 kB minified; split it out once the legacy file is decomposed.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
});
