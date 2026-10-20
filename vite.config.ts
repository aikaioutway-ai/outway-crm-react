import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Номер сборки: открытая CRM сверяет его с /version.json и узнаёт о новой версии. */
const APP_VERSION = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'local'}-${Date.now().toString(36)}`;

function appVersionFile(): Plugin {
  return {
    name: 'outway-app-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), appVersionFile()],
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PORT) || 3001,
      proxy: {
        '/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/anthropic/, ''),
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              const apiKey = env.VITE_ANTHROPIC_API_KEY;
              if (apiKey) proxyReq.setHeader('x-api-key', apiKey);
              proxyReq.setHeader('anthropic-version', '2023-06-01');
            });
          },
        },
      },
    },
  };
});
