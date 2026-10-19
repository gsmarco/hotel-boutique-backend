const Reservation = require('../models/reservationModel');
const AppError = require('../utils/AppError');
async function getReservation(id) {
  const row = await Reservation.findById(id);
  if (!row) throw new AppError('Reserva no encontrada.', 404, 'RESERVATION_NOT_FOUND');
  const { query } = require('../config/db');
  const { rows } = await query(
    `SELECT expira_en,liberada FROM retenciones WHERE reserva_id=$1`, [id]
  );
  return { ...row, retencion: rows[0] || null };
}
module.exports = { getReservation };
