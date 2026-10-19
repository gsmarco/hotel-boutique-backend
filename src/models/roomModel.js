const { query } = require('../config/db');
const Room = {
  async list() {
    const { rows } = await query(
      `SELECT h.id,h.numero,h.piso,h.activa,t.id AS tipo_id,t.nombre AS tipo,
              t.capacidad,t.precio_noche,t.descripcion
       FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipo_id
       WHERE h.activa=true ORDER BY h.numero`
    );
    return rows;
  },
  async findById(id) {
    const { rows } = await query(
      `SELECT h.id,h.numero,h.piso,h.activa,t.id AS tipo_id,t.nombre AS tipo,
              t.capacidad,t.precio_noche,t.descripcion
       FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipo_id WHERE h.id=$1`, [id]
    );
    return rows[0] || null;
  },
  async available({ checkIn, checkOut, guests }) {
    const { rows } = await query(
      `SELECT h.id,h.numero,h.piso,t.nombre AS tipo,t.capacidad,t.precio_noche,t.descripcion
       FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipo_id
       WHERE h.activa=true AND t.capacidad >= $3
       AND NOT EXISTS (
         SELECT 1 FROM ocupaciones o
         WHERE o.habitacion_id=h.id
           AND o.periodo && tstzrange($1::date::timestamptz,$2::date::timestamptz,'[)')
       )
       ORDER BY t.precio_noche,h.numero`,
      [checkIn, checkOut, guests]
    );
    return rows;
  },
  async create({ numero, tipoId, piso }) {
    const { rows } = await query(
      `INSERT INTO habitaciones(numero,tipo_id,piso) VALUES($1,$2,$3)
       RETURNING id,numero,tipo_id,piso,activa,creado_en`, [numero, tipoId, piso ?? null]
    );
    return rows[0];
  },
  async update(id, data) {
    const { rows } = await query(
      `UPDATE habitaciones SET
       numero=COALESCE($2,numero), tipo_id=COALESCE($3,tipo_id),
       piso=COALESCE($4,piso), activa=COALESCE($5,activa)
       WHERE id=$1 RETURNING id,numero,tipo_id,piso,activa,creado_en`,
      [id, data.numero ?? null, data.tipoId ?? null, data.piso ?? null, data.activa ?? null]
    );
    return rows[0] || null;
  }
};
module.exports = Room;
