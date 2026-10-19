const { query } = require('../config/db');
async function audit(event, reservationId = null, details = {}) {
  try {
    await query(
      'INSERT INTO auditoria_reservas (reserva_id, evento, detalle) VALUES ($1, $2, $3::jsonb)',
      [reservationId, event, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('No fue posible guardar auditoría:', err.message);
  }
}
module.exports = { audit };
