const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tipos_habitacion(nombre,capacidad,precio_noche,descripcion) VALUES
       ('Sencilla',1,850.00,'Cama individual, vista interior'),
       ('Doble',2,1250.00,'Cama matrimonial, vista al jardín'),
       ('Suite',4,2800.00,'Sala privada y terraza')
       ON CONFLICT(nombre) DO NOTHING`
    );
    await client.query(
      `INSERT INTO habitaciones(numero,tipo_id,piso) VALUES
       ('101',(SELECT id FROM tipos_habitacion WHERE nombre='Sencilla'),1),
       ('102',(SELECT id FROM tipos_habitacion WHERE nombre='Sencilla'),1),
       ('201',(SELECT id FROM tipos_habitacion WHERE nombre='Doble'),2),
       ('202',(SELECT id FROM tipos_habitacion WHERE nombre='Doble'),2),
       ('301',(SELECT id FROM tipos_habitacion WHERE nombre='Suite'),3)
       ON CONFLICT(numero) DO NOTHING`
    );
    const hash = await bcrypt.hash('Admin123!', 12);
    await client.query(
      `INSERT INTO usuarios(nombre,email,password_hash,rol) VALUES('Administrador','admin@hotel.test',$1,'admin')
       ON CONFLICT(email) DO NOTHING`, [hash]
    );
    await client.query('COMMIT');
    console.log('Seed aplicado. Admin de demostración: admin@hotel.test / Admin123!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e.message); process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
})();
