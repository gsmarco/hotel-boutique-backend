const dotenv = require('dotenv');
dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Falta la variable de entorno ${key}. Revisa .env.example.`);
}
if (process.env.JWT_SECRET.length < 32 && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  holdMinutes: Math.max(1, Number(process.env.HOLD_MINUTES || 12)),
  nodeEnv: process.env.NODE_ENV || 'development'
};
