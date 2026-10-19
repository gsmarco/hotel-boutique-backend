const { query } = require('../config/db');
const Reservation = {
  async listByUser(userId) {
    const { rows } = await query(
      `SELECT r.id,r.codigo,r.habitacion_id,r.usuario_id,e.codigo AS estado,
              lower(r.periodo)::date AS check_in,upper(r.periodo)::date AS check_out,
              r.num_huespedes,r.precio_total,r.creado_en,h.numero,t.nombre AS tipo
       FROM reservas r JOIN estados_reserva e ON e.id=r.estado_id
       JOIN habitaciones h ON h.id=r.habitacion_id JOIN tipos_habitacion t ON t.id=h.tipo_id
       WHERE r.usuario_id=$1 ORDER BY r.creado_en DESC`, [userId]
    );
    return rows;
  },
  async findById(id) {
    const { rows } = await query(
      `SELECT r.id,r.codigo,r.habitacion_id,r.usuario_id,e.codigo AS estado,
              lower(r.periodo)::date AS check_in,upper(r.periodo)::date AS check_out,
              r.num_huespedes,r.precio_total,r.idempotency_key,r.creado_en,r.actualizado_en,
              h.numero,t.nombre AS tipo,t.precio_noche
       FROM reservas r JOIN estados_reserva e ON e.id=r.estado_id
       JOIN habitaciones h ON h.id=r.habitacion_id JOIN tipos_habitacion t ON t.id=h.tipo_id
       WHERE r.id=$1`, [id]
    );
    return rows[0] || null;
  },
  async listAll() {
    const { rows } = await query(
      `SELECT r.id,r.codigo,r.usuario_id,u.nombre AS cliente,u.email,e.codigo AS estado,
              h.numero,lower(r.periodo)::date AS check_in,upper(r.periodo)::date AS check_out,
              r.num_huespedes,r.precio_total,r.creado_en
       FROM reservas r JOIN usuarios u ON u.id=r.usuario_id
       JOIN estados_reserva e ON e.id=r.estado_id JOIN habitaciones h ON h.id=r.habitacion_id
       ORDER BY r.creado_en DESC`
    );
    return rows;
  }
};
module.exports = Reservation;
