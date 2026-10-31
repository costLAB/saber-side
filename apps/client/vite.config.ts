import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `pnpm dev:https` serves over a self-signed certificate so an iPad or Quest on the same
// network can open the dev server. WebXR only runs in a secure context.
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  server: { host: true },
  preview: { host: true },
  // three.js alone is ~600 kB minified; split it out once the legacy file is decomposed.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
});
