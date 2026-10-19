const AppError = require('./AppError');

function validateDateRange(checkIn, checkOut) {
  // if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(checkIn)) ||
  //     !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(checkOut))) {
  //   throw new AppError('checkIn y checkOut deben tener formato YYYY-MM-DD.', 400, 'INVALID_DATE');
  // }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(checkIn)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(checkOut))) {
    throw new AppError(
      'checkIn y checkOut deben tener formato YYYY-MM-DD.',
      400,
      'INVALID_DATE'
    );
  }
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== checkIn || end.toISOString().slice(0, 10) !== checkOut) {
    throw new AppError('Las fechas no son válidas.', 400, 'INVALID_DATE');
  }
  if (start >= end) throw new AppError('checkOut debe ser posterior a checkIn.', 400, 'INVALID_DATE_RANGE');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (start < today) throw new AppError('La fecha de entrada no puede estar en el pasado.', 400, 'PAST_CHECKIN');
  return { start, end };
}

function nightsBetween(checkIn, checkOut) {
  return Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86400000);
}
module.exports = { validateDateRange, nightsBetween };
