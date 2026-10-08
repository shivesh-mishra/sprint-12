import { config } from './config.js';
import { createApp } from './app.js';

const { server, io } = createApp(config);

server.listen(config.port, () => {
  console.log(`[server] listening on :${config.port} (${config.isProd ? 'production' : 'development'})`);
  console.log(`[server] allowed origins: ${config.clientOrigins.join(', ')}`);
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} received, shutting down`);
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[server] unhandledRejection:', e));
process.on('uncaughtException', (e) => {
  console.error('[server] uncaughtException:', e);
  shutdown('uncaughtException');
});
