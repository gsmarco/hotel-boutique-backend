const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/userModel');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const AppError = require('../utils/AppError');
const { audit } = require('../middleware/audit');

const registerSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150),
  telefono: z.string().trim().max(25).optional(),
  password: z.string().min(8).max(72)
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) });

function tokenFor(user) {
  return jwt.sign({ sub: String(user.id), role: user.rol, email: user.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}
exports.register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    if (await User.findByEmail(data.email)) throw new AppError('El correo ya está registrado.', 409, 'EMAIL_EXISTS');
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({ ...data, passwordHash });
    await audit('USUARIO_REGISTRADO', null, { userId: user.id });
    res.status(201).json({ success: true, data: { user, token: tokenFor(user) } });
  } catch (err) { if (err.name === 'ZodError') return next(new AppError('Datos de registro inválidos.', 400, 'VALIDATION_ERROR', err.issues)); next(err); }
};
exports.login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await User.findByEmail(data.email);
    if (!user || !user.password_hash || !(await bcrypt.compare(data.password, user.password_hash))) {
      throw new AppError('Correo o contraseña incorrectos.', 401, 'INVALID_CREDENTIALS');
    }
    const safeUser = { id: user.id, nombre: user.nombre, email: user.email, telefono: user.telefono, rol: user.rol };
    res.json({ success: true, data: { user: safeUser, token: tokenFor(safeUser) } });
  } catch (err) { if (err.name === 'ZodError') return next(new AppError('Correo o contraseña inválidos.', 400, 'VALIDATION_ERROR', err.issues)); next(err); }
};
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) throw new AppError('Usuario no encontrado.', 404, 'USER_NOT_FOUND');
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
};
