const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/anthropic',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      pathRewrite: { '^/anthropic': '' },
      onProxyReq: function (proxyReq) {
        const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY;
        if (apiKey) proxyReq.setHeader('x-api-key', apiKey);
        proxyReq.setHeader('anthropic-version', '2023-06-01');
      },
    })
  );
};
