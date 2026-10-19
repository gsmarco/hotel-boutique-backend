const { pool, query } = require('../config/db');
const { holdMinutes } = require('../config/env');
const { validateDateRange, nightsBetween } = require('../utils/dates');
const AppError = require('../utils/AppError');
const { audit } = require('../middleware/audit');

async function expireRetentions(client = null) {
  const db = client || { query };
  const result = await db.query(
    `WITH expired AS (
       UPDATE retenciones SET liberada=true
       WHERE liberada=false AND expira_en <= now()
       RETURNING reserva_id
     ), changed AS (
       UPDATE reservas r SET estado_id=(SELECT id FROM estados_reserva WHERE codigo='EXPIRADA'),
         actualizado_en=now()
       WHERE r.id IN (SELECT reserva_id FROM expired)
         AND r.estado_id IN (SELECT id FROM estados_reserva WHERE codigo IN ('RETENIDA','PENDIENTE'))
       RETURNING r.id
     ), deleted AS (
       DELETE FROM ocupaciones WHERE reserva_id IN (SELECT id FROM changed)
       RETURNING reserva_id
     )
     INSERT INTO auditoria_reservas(reserva_id,evento,detalle)
     SELECT id,'EXPIRADA','{"motivo":"retencion expirada"}'::jsonb FROM changed
     RETURNING reserva_id`
  );
  return result.rowCount;
}

async function createReservation({ userId, roomId, checkIn, checkOut, guests, idempotencyKey }) {
  validateDateRange(checkIn, checkOut);
  if (!idempotencyKey || idempotencyKey.length > 80) {
    throw new AppError('Envía un encabezado Idempotency-Key de hasta 80 caracteres.', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  const client = await pool.connect();
  let reservationId = null;
  try {
    await client.query('BEGIN');
    await expireRetentions(client);
    const existing = await client.query(
      `SELECT id FROM reservas WHERE idempotency_key=$1`, [idempotencyKey]
    );
    if (existing.rows[0]) {
      const old = await client.query(
        `SELECT id,usuario_id FROM reservas WHERE id=$1`, [existing.rows[0].id]
      );
      if (old.rows[0].usuario_id !== userId) throw new AppError('La clave de idempotencia ya fue usada.', 409, 'IDEMPOTENCY_CONFLICT');
      await client.query('COMMIT');
      return { reservation: await require('./reservationRead').getReservation(existing.rows[0].id), replayed: true };
    }

    const roomResult = await client.query(
      `SELECT h.id,h.activa,t.capacidad,t.precio_noche
       FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipo_id
       WHERE h.id=$1 FOR UPDATE OF h`, [roomId]
    );
    const room = roomResult.rows[0];
    if (!room || !room.activa) throw new AppError('La habitación no existe o está fuera de servicio.', 404, 'ROOM_NOT_FOUND');
    if (guests > room.capacidad) throw new AppError('La cantidad de huéspedes supera la capacidad.', 400, 'CAPACITY_EXCEEDED');

    const period = `[${checkIn} 00:00:00+00,${checkOut} 00:00:00+00)`;
    const nights = nightsBetween(checkIn, checkOut);
    const total = (Number(room.precio_noche) * nights).toFixed(2);
    const pending = await client.query(`SELECT id FROM estados_reserva WHERE codigo='RETENIDA'`);
    const created = await client.query(
      `INSERT INTO reservas(habitacion_id,usuario_id,estado_id,periodo,num_huespedes,precio_total,idempotency_key)
       VALUES($1,$2,$3,tstzrange($4::timestamptz,$5::timestamptz,'[)'),$6,$7,$8)
       RETURNING id`,
      [roomId, userId, pending.rows[0].id, `${checkIn} 00:00:00+00`, `${checkOut} 00:00:00+00`, guests, total, idempotencyKey]
    );
    reservationId = created.rows[0].id;
    await client.query(
      `INSERT INTO ocupaciones(reserva_id,habitacion_id,periodo)
       SELECT $1,$2,periodo FROM reservas WHERE id=$1`, [reservationId, roomId]
    );
    await client.query(
      `INSERT INTO retenciones(reserva_id,expira_en) VALUES($1,now()+($2 || ' minutes')::interval)`,
      [reservationId, holdMinutes]
    );
    await client.query(
      `INSERT INTO auditoria_reservas(reserva_id,evento,detalle) VALUES($1,'RETENIDA',$2::jsonb)`,
      [reservationId, JSON.stringify({ userId, roomId, checkIn, checkOut, holdMinutes })]
    );
    await client.query('COMMIT');
    return { reservation: await require('./reservationRead').getReservation(reservationId), replayed: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function cancelReservation(reservation, actorId, isAdmin) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT r.id,r.usuario_id,e.codigo AS estado FROM reservas r
       JOIN estados_reserva e ON e.id=r.estado_id WHERE r.id=$1 FOR UPDATE`, [reservation.id]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Reserva no encontrada.', 404, 'RESERVATION_NOT_FOUND');
    if (!isAdmin && row.usuario_id !== actorId) throw new AppError('No puedes modificar esta reserva.', 403, 'FORBIDDEN');
    if (['CANCELADA','EXPIRADA'].includes(row.estado)) throw new AppError('La reserva ya está cancelada o expirada.', 409, 'RESERVATION_CLOSED');
    if (row.estado === 'CONFIRMADA') throw new AppError('Una reserva confirmada requiere gestión administrativa para cancelarse.', 409, 'RESERVATION_CONFIRMED');
    await client.query(`UPDATE reservas SET estado_id=(SELECT id FROM estados_reserva WHERE codigo='CANCELADA'),actualizado_en=now() WHERE id=$1`, [row.id]);
    await client.query('DELETE FROM ocupaciones WHERE reserva_id=$1', [row.id]);
    await client.query('UPDATE retenciones SET liberada=true WHERE reserva_id=$1', [row.id]);
    await client.query(`INSERT INTO auditoria_reservas(reserva_id,evento,detalle) VALUES($1,'CANCELADA',$2::jsonb)`,
      [row.id, JSON.stringify({ actorId, isAdmin })]);
    await client.query('COMMIT');
    return require('./reservationRead').getReservation(row.id);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

async function payReservation(reservation, actorId, isAdmin, simulate) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT r.*,e.codigo AS estado FROM reservas r JOIN estados_reserva e ON e.id=r.estado_id
       WHERE r.id=$1 FOR UPDATE`, [reservation.id]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Reserva no encontrada.', 404, 'RESERVATION_NOT_FOUND');
    if (!isAdmin && row.usuario_id !== actorId) throw new AppError('No puedes pagar esta reserva.', 403, 'FORBIDDEN');
    if (row.estado !== 'RETENIDA') throw new AppError('La reserva no está retenida para pago; quizá expiró.', 409, 'RESERVATION_NOT_PAYABLE');
    const hold = await client.query('SELECT liberada,expira_en FROM retenciones WHERE reserva_id=$1 FOR UPDATE', [row.id]);
    if (!hold.rows[0] || hold.rows[0].liberada || new Date(hold.rows[0].expira_en) <= new Date()) {
      throw new AppError('La retención expiró. Crea una nueva reserva.', 409, 'HOLD_EXPIRED');
    }
    const approved = simulate === 'approved';
    await client.query(
      `INSERT INTO pagos(reserva_id,monto,estado,referencia) VALUES($1,$2,$3,$4)`,
      [row.id, row.precio_total, approved ? 'aprobado' : 'rechazado', `SIM-${Date.now()}`]
    );
    if (approved) {
      await client.query(`UPDATE reservas SET estado_id=(SELECT id FROM estados_reserva WHERE codigo='CONFIRMADA'),actualizado_en=now() WHERE id=$1`, [row.id]);
      await client.query('UPDATE retenciones SET liberada=true WHERE reserva_id=$1', [row.id]);
      await client.query(`INSERT INTO auditoria_reservas(reserva_id,evento,detalle) VALUES($1,'CONFIRMADA',$2::jsonb)`,
        [row.id, JSON.stringify({ actorId, payment: 'simulado_aprobado' })]);
    } else {
      await client.query(`UPDATE reservas SET estado_id=(SELECT id FROM estados_reserva WHERE codigo='CANCELADA'),actualizado_en=now() WHERE id=$1`, [row.id]);
      await client.query('DELETE FROM ocupaciones WHERE reserva_id=$1', [row.id]);
      await client.query('UPDATE retenciones SET liberada=true WHERE reserva_id=$1', [row.id]);
      await client.query(`INSERT INTO auditoria_reservas(reserva_id,evento,detalle) VALUES($1,'CANCELADA',$2::jsonb)`,
        [row.id, JSON.stringify({ actorId, payment: 'simulado_rechazado' })]);
    }
    await client.query('COMMIT');
    return { reservation: await require('./reservationRead').getReservation(row.id), paymentStatus: approved ? 'aprobado' : 'rechazado' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}
module.exports = { expireRetentions, createReservation, cancelReservation, payReservation };
