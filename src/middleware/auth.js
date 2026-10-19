const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const AppError = require('../utils/AppError');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new AppError('Se requiere un token Bearer.', 401, 'AUTH_REQUIRED'));
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return next(new AppError('Token inválido o expirado.', 401, 'INVALID_TOKEN'));
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Autenticación requerida.', 401, 'AUTH_REQUIRED'));
    if (!roles.includes(req.user.role)) return next(new AppError('No tienes permisos para esta operación.', 403, 'FORBIDDEN'));
    return next();
  };
}
module.exports = { authenticate, authorize };
