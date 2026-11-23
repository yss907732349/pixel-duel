'use strict';
const { createDuelServer } = require('./server/rooms.cjs');
if (require.main === module) {
  const port = Number(process.env.PORT || process.env.PIXEL_DUEL_PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  const app = createDuelServer();
  app.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。` : error.message);
    process.exitCode = 1;
  });
  app.server.listen(port, host, () => console.log(`逐影房间服务：http://localhost:${port}（局域网请使用本机 IP）`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createDuelServer };
