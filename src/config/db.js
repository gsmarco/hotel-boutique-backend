const { Pool } = require('pg');
const { databaseUrl, nodeEnv } = require('./env');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
pool.on('error', (err) => console.error('Error inesperado en pool PostgreSQL:', err.message));

async function query(text, params) {
  return pool.query(text, params);
}
module.exports = { pool, query };
