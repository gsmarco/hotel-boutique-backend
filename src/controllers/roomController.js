const { z } = require('zod');
const Room = require('../models/roomModel');
const { validateDateRange } = require('../utils/dates');
const AppError = require('../utils/AppError');

exports.list = async (req, res, next) => {
  try { res.json({ success: true, data: await Room.list() }); } catch (e) { next(e); }
};
exports.get = async (req, res, next) => {
  try {
    const room = await Room.findById(Number(req.params.id));
    if (!room) throw new AppError('Habitación no encontrada.', 404, 'ROOM_NOT_FOUND');
    res.json({ success: true, data: room });
  } catch (e) { next(e); }
};
exports.availability = async (req, res, next) => {
  try {
    const schema = z.object({
      checkIn: z.string(), checkOut: z.string(),
      guests: z.coerce.number().int().min(1).max(20).default(1)
    });
    const params = schema.parse(req.query);
    validateDateRange(params.checkIn, params.checkOut);
    const rooms = await Room.available(params);
    res.json({ success: true, data: { checkIn: params.checkIn, checkOut: params.checkOut, guests: params.guests, rooms } });
  } catch (e) {
    if (e.name === 'ZodError') return next(new AppError('Parámetros de búsqueda inválidos.', 400, 'VALIDATION_ERROR', e.issues));
    next(e);
  }
};
exports.create = async (req, res, next) => {
  try {
    const schema = z.object({ numero: z.string().trim().min(1).max(10), tipoId: z.number().int().positive(), piso: z.number().int().optional() });
    const data = schema.parse(req.body);
    const room = await Room.create(data);
    res.status(201).json({ success: true, data: room });
  } catch (e) {
    if (e.name === 'ZodError') return next(new AppError('Datos de habitación inválidos.', 400, 'VALIDATION_ERROR', e.issues));
    next(e);
  }
};
exports.update = async (req, res, next) => {
  try {
    const schema = z.object({ numero: z.string().trim().min(1).max(10).optional(), tipoId: z.number().int().positive().optional(), piso: z.number().int().nullable().optional(), activa: z.boolean().optional() }).strict();
    const data = schema.parse(req.body);
    const room = await Room.update(Number(req.params.id), data);
    if (!room) throw new AppError('Habitación no encontrada.', 404, 'ROOM_NOT_FOUND');
    res.json({ success: true, data: room });
  } catch (e) {
    if (e.name === 'ZodError') return next(new AppError('Datos de habitación inválidos.', 400, 'VALIDATION_ERROR', e.issues));
    next(e);
  }
};
