-- =====================================================================
-- Base de datos: hotel_real (PostgreSQL 16)
-- =====================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash TEXT NOT NULL,
    role VARCHAR(12) NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de Habitaciones
CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('Sencilla', 'Doble', 'Suite')),
    guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 20),
    beds VARCHAR(100) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    image TEXT NOT NULL DEFAULT '',
    tag VARCHAR(100) NOT NULL DEFAULT 'Disponible',
    description TEXT NOT NULL DEFAULT '',
    features TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabla de Reservas
CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(30) PRIMARY KEY DEFAULT ('MA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
    user_id BIGINT NOT NULL REFERENCES users(id),
    room_id BIGINT NOT NULL REFERENCES rooms(id),
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guests INTEGER NOT NULL CHECK (guests > 0),
    nightly_rate NUMERIC(12, 2) NOT NULL,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 620,
    total NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(100) NOT NULL DEFAULT 'Simulado (sin cobro)',
    status VARCHAR(15) NOT NULL DEFAULT 'Confirmada' CHECK (status IN ('Confirmada', 'Cancelada', 'Pendiente')),
    idempotency_key VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    CHECK (check_out > check_in),
    UNIQUE (user_id, idempotency_key)
);

-- Restricción para evitar solapamiento de fechas en reservas activas/pendientes
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings 
    ADD CONSTRAINT bookings_no_overlap 
    EXCLUDE USING gist (
        room_id WITH =, 
        daterange(check_in, check_out, '[)') WITH &&
    ) 
    WHERE (status IN ('Confirmada', 'Pendiente'));

-- Índice para optimizar consultas de reservas por usuario
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id, created_at DESC);

-- 5. Tabla de Mensajes de Contacto
CREATE TABLE IF NOT EXISTS contact_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -- Ejecutar en la base hotel_real, PostgreSQL 16
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- CREATE TABLE IF NOT EXISTS users(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name VARCHAR(150) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,phone VARCHAR(30),password_hash TEXT NOT NULL,role VARCHAR(12) NOT NULL DEFAULT 'cliente' CHECK(role IN('cliente','admin')),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- CREATE TABLE IF NOT EXISTS rooms(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name VARCHAR(120) NOT NULL UNIQUE,type VARCHAR(20) NOT NULL CHECK(type IN('Sencilla','Doble','Suite')),guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 20),beds VARCHAR(100) NOT NULL,price NUMERIC(12,2) NOT NULL CHECK(price>0),image TEXT NOT NULL DEFAULT '',tag VARCHAR(100) NOT NULL DEFAULT 'Disponible',description TEXT NOT NULL DEFAULT '',features TEXT[] NOT NULL DEFAULT '{}',active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- CREATE TABLE IF NOT EXISTS bookings(id VARCHAR(30) PRIMARY KEY DEFAULT ('MA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),user_id BIGINT NOT NULL REFERENCES users(id),room_id BIGINT NOT NULL REFERENCES rooms(id),check_in DATE NOT NULL,check_out DATE NOT NULL,guests INTEGER NOT NULL CHECK(guests>0),nightly_rate NUMERIC(12,2) NOT NULL,tax NUMERIC(12,2) NOT NULL DEFAULT 620,total NUMERIC(12,2) NOT NULL,payment_method VARCHAR(100) NOT NULL DEFAULT 'Simulado (sin cobro)',status VARCHAR(15) NOT NULL DEFAULT 'Confirmada' CHECK(status IN('Confirmada','Cancelada','Pendiente')),idempotency_key VARCHAR(80),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),cancelled_at TIMESTAMPTZ,CHECK(check_out>check_in),UNIQUE(user_id,idempotency_key));
-- ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
-- ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist(room_id WITH =,daterange(check_in,check_out,'[)') WITH &&) WHERE(status IN('Confirmada','Pendiente'));
-- CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id,created_at DESC);
-- CREATE TABLE IF NOT EXISTS contact_messages(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT REFERENCES users(id),name VARCHAR(150) NOT NULL,email VARCHAR(254) NOT NULL,subject VARCHAR(100) NOT NULL,message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
