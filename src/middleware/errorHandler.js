const { nodeEnv } = require('../config/env');
function notFound(req, res, next) {
  const err = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  err.code = 'ROUTE_NOT_FOUND';
  next(err);
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Error interno del servidor.';
  if (err.code === '23P01') {
    status = 409; code = 'ROOM_UNAVAILABLE';
    message = 'La habitación ya está ocupada durante alguna parte de ese periodo.';
  } else if (err.code === '23505') {
    status = 409; code = 'DUPLICATE_RESOURCE';
    message = 'El registro ya existe o la solicitud ya fue procesada.';
  } else if (err.code === '23503') {
    status = 400; code = 'INVALID_REFERENCE';
    message = 'Alguna referencia indicada no existe.';
  }
  if (status >= 500) console.error(err.stack || err);
  res.status(status).json({
    success: false,
    error: { code, message, ...(err.details ? { details: err.details } : {}),
      ...(nodeEnv === 'development' && status >= 500 ? { stack: err.stack } : {}) }
  });
}
module.exports = { notFound, errorHandler };
