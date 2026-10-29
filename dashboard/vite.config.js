import { defineConfig } from 'vite';

const backendTarget = process.env.VITE_BACKEND_URL || process.env.VITE_API_BASE_URL || '';
const wsTarget = process.env.VITE_WS_URL || '';

const proxyConfig = {};
if (backendTarget) {
  proxyConfig['/api'] = {
    target: backendTarget,
    changeOrigin: true
  };
}
if (wsTarget) {
  proxyConfig['/ws'] = {
    target: wsTarget,
    ws: true
  };
}

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: proxyConfig
  }
});
