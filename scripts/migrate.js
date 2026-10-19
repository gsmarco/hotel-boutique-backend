const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');
(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Esquema PostgreSQL aplicado correctamente.');
  } catch (err) {
    console.error('Error aplicando migración:', err.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
