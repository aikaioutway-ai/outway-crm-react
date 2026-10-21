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
  const anthropicKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY;

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
          bypass: (_req, res) => {
            if (!anthropicKey) {
              res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'OCR не настроен: добавьте ANTHROPIC_API_KEY в .env.local и перезапустите сервер' }));
              return false;
            }
          },
          rewrite: path => path.replace(/^\/anthropic/, ''),
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              if (anthropicKey) proxyReq.setHeader('x-api-key', anthropicKey);
              proxyReq.setHeader('anthropic-version', '2023-06-01');
            });
          },
        },
      },
    },
  };
});
