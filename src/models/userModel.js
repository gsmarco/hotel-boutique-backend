const { query } = require('../config/db');
const User = {
  async findByEmail(email) {
    const { rows } = await query('SELECT * FROM usuarios WHERE lower(email)=lower($1)', [email]);
    return rows[0] || null;
  },
  async findById(id) {
    const { rows } = await query('SELECT id,nombre,email,telefono,rol,creado_en FROM usuarios WHERE id=$1', [id]);
    return rows[0] || null;
  },
  async create({ nombre, email, telefono, passwordHash }) {
    const { rows } = await query(
      `INSERT INTO usuarios (nombre,email,telefono,password_hash,rol)
       VALUES ($1,$2,$3,$4,'cliente')
       RETURNING id,nombre,email,telefono,rol,creado_en`,
      [nombre, email, telefono || null, passwordHash]
    );
    return rows[0];
  }
};
module.exports = User;
