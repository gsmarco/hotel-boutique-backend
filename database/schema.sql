CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS estados_reserva (
  id SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  descripcion TEXT NOT NULL
);
INSERT INTO estados_reserva(codigo,descripcion) VALUES
 ('PENDIENTE','Reserva iniciada, aún sin retención de pago'),
 ('RETENIDA','Habitación retenida temporalmente durante el pago'),
 ('CONFIRMADA','Pago exitoso, habitación asignada al cliente'),
 ('CANCELADA','Reserva cancelada por el cliente o sistema'),
 ('EXPIRADA','Retención expirada sin pago, inventario liberado')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS tipos_habitacion (
 id SERIAL PRIMARY KEY,
 nombre VARCHAR(50) NOT NULL UNIQUE,
 capacidad SMALLINT NOT NULL CHECK(capacidad>0),
 precio_noche NUMERIC(10,2) NOT NULL CHECK(precio_noche>=0),
 descripcion TEXT
);
CREATE TABLE IF NOT EXISTS habitaciones (
 id SERIAL PRIMARY KEY,
 numero VARCHAR(10) NOT NULL UNIQUE,
 tipo_id INT NOT NULL REFERENCES tipos_habitacion(id),
 piso SMALLINT,
 activa BOOLEAN NOT NULL DEFAULT TRUE,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usuarios (
 id SERIAL PRIMARY KEY,
 nombre VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE,
 telefono VARCHAR(25),
 password_hash TEXT,
 rol VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK(rol IN ('cliente','admin')),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reservas (
 id SERIAL PRIMARY KEY,
 codigo UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 habitacion_id INT NOT NULL REFERENCES habitaciones(id),
 usuario_id INT NOT NULL REFERENCES usuarios(id),
 estado_id SMALLINT NOT NULL REFERENCES estados_reserva(id),
 periodo TSTZRANGE NOT NULL,
 num_huespedes SMALLINT NOT NULL CHECK(num_huespedes>0),
 precio_total NUMERIC(10,2) NOT NULL CHECK(precio_total>=0),
 idempotency_key VARCHAR(80) UNIQUE,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(NOT isempty(periodo)),
 CHECK(lower(periodo)<upper(periodo))
);
CREATE TABLE IF NOT EXISTS ocupaciones (
 id BIGSERIAL PRIMARY KEY,
 reserva_id INT NOT NULL UNIQUE REFERENCES reservas(id) ON DELETE CASCADE,
 habitacion_id INT NOT NULL REFERENCES habitaciones(id),
 periodo TSTZRANGE NOT NULL,
 EXCLUDE USING gist(habitacion_id WITH =, periodo WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_ocupaciones_habitacion ON ocupaciones(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_ocupaciones_periodo ON ocupaciones USING gist(periodo);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado_id);
CREATE TABLE IF NOT EXISTS retenciones (
 id SERIAL PRIMARY KEY,
 reserva_id INT NOT NULL UNIQUE REFERENCES reservas(id) ON DELETE CASCADE,
 expira_en TIMESTAMPTZ NOT NULL,
 liberada BOOLEAN NOT NULL DEFAULT FALSE,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retenciones_expira ON retenciones(expira_en) WHERE NOT liberada;
CREATE TABLE IF NOT EXISTS pagos (
 id SERIAL PRIMARY KEY,
 reserva_id INT NOT NULL REFERENCES reservas(id),
 monto NUMERIC(10,2) NOT NULL CHECK(monto>=0),
 moneda CHAR(3) NOT NULL DEFAULT 'MXN',
 estado VARCHAR(20) NOT NULL DEFAULT 'iniciado' CHECK(estado IN ('iniciado','aprobado','rechazado','reembolsado')),
 referencia VARCHAR(80),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auditoria_reservas (
 id BIGSERIAL PRIMARY KEY,
 reserva_id INT REFERENCES reservas(id) ON DELETE SET NULL,
 evento VARCHAR(40) NOT NULL,
 detalle JSONB,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_reserva ON auditoria_reservas(reserva_id);
CREATE OR REPLACE VIEW v_disponibilidad AS
 SELECT h.id AS habitacion_id,h.numero,t.nombre AS tipo,t.capacidad,t.precio_noche,o.periodo AS periodo_ocupado
 FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipo_id
 LEFT JOIN ocupaciones o ON o.habitacion_id=h.id WHERE h.activa;
