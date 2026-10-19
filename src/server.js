const app = require('./app');
const { pool } = require('./config/db');
const { port } = require('./config/env');

const server = app.listen(port, () => console.log(`Hotel Boutique API escuchando en http://localhost:${port}`));
async function shutdown(signal) {
  console.log(`${signal}: cerrando servidor...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
module.exports = server;
