const { nightsBetween, validateDateRange } = require('../src/utils/dates');

describe('utilidades de fechas', () => {
  test('calcula las noches sin incluir el día de salida', () => {
    expect(nightsBetween('2026-11-01', '2026-11-04')).toBe(3);
  });
  test('rechaza una salida anterior o igual a la entrada', () => {
    expect(() => validateDateRange('2026-11-03', '2026-11-03')).toThrow();
  });
  test('rechaza fechas que no siguen YYYY-MM-DD', () => {
    expect(() => validateDateRange('01/11/2026', '2026-11-03')).toThrow();
  });
});
