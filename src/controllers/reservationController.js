const { z } = require('zod');
const Reservation = require('../models/reservationModel');
const { createReservation, cancelReservation, payReservation, expireRetentions } = require('../services/reservationService');
const { getReservation } = require('../services/reservationRead');
const AppError = require('../utils/AppError');

exports.create = async (req, res, next) => {
  try {
    const schema = z.object({
      roomId: z.number().int().positive(),
      checkIn: z.string(),
      checkOut: z.string(),
      guests: z.number().int().min(1).max(20)
    });
    const data = schema.parse(req.body);
    const idempotencyKey = req.get('Idempotency-Key');
    const result = await createReservation({ userId: Number(req.user.sub), ...data, idempotencyKey });
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result.reservation, meta: { replayed: result.replayed } });
  } catch (e) {
    if (e.name === 'ZodError') return next(new AppError('Datos de reservación inválidos.', 400, 'VALIDATION_ERROR', e.issues));
    next(e);
  }
};
exports.mine = async (req, res, next) => {
  try { await expireRetentions(); res.json({ success: true, data: await Reservation.listByUser(Number(req.user.sub)) }); } catch (e) { next(e); }
};
exports.get = async (req, res, next) => {
  try {
    const reservation = await getReservation(Number(req.params.id));
    if (req.user.role !== 'admin' && Number(reservation.usuario_id) !== Number(req.user.sub)) throw new AppError('No puedes consultar esta reserva.', 403, 'FORBIDDEN');
    res.json({ success: true, data: reservation });
  } catch (e) { next(e); }
};
exports.cancel = async (req, res, next) => {
  try {
    const reservation = await getReservation(Number(req.params.id));
    const result = await cancelReservation(reservation, Number(req.user.sub), req.user.role === 'admin');
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
};
exports.pay = async (req, res, next) => {
  try {
    const schema = z.object({ simulate: z.enum(['approved', 'rejected']) }).default({ simulate: 'approved' });
    const body = schema.parse(req.body || {});
    const reservation = await getReservation(Number(req.params.id));
    const result = await payReservation(reservation, Number(req.user.sub), req.user.role === 'admin', body.simulate);
    res.json({ success: true, data: result });
  } catch (e) {
    if (e.name === 'ZodError') return next(new AppError('El campo simulate debe ser approved o rejected.', 400, 'VALIDATION_ERROR', e.issues));
    next(e);
  }
};
exports.adminList = async (req, res, next) => {
  try { await expireRetentions(); res.json({ success: true, data: await Reservation.listAll() }); } catch (e) { next(e); }
};
exports.expire = async (req, res, next) => {
  try { const count = await expireRetentions(); res.json({ success: true, data: { expiredReservations: count } }); } catch (e) { next(e); }
};
exports.audit = async (req, res, next) => {
  try {
    const { query } = require('../config/db');
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const { rows } = await query('SELECT * FROM auditoria_reservas ORDER BY creado_en DESC LIMIT $1', [limit]);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};
