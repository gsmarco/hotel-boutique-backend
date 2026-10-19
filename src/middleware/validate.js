const AppError = require('../utils/AppError');
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError('Datos de entrada inválidos.', 400, 'VALIDATION_ERROR',
        result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))));
    }
    req[source] = result.data;
    next();
  };
}
module.exports = validate;
