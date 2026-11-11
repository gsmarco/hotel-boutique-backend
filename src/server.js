require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { Pool } = require("pg");
const optionalAuth = require("./middlewares/optionalAuth");

if (
    !process.env.DATABASE_URL ||
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32
)
    throw Error("Configura DATABASE_URL y JWT_SECRET de 32+ caracteres");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.disable("x-powered-by");

const allowedOrigins = (
    process.env.FRONTEND_ORIGIN ||
    "http://localhost:5173"
)
    .split(",")
    .map(origin => origin.trim());

app.use(
    cors({
        origin: allowedOrigins,
    }),
);

// app.use(
//     cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }),
// );

app.use(express.json({ limit: "32kb" }));

app.use(
    "/api/auth",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: "draft-7",
        legacyHeaders: false,
    }),
);

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });

const validate = (schema, data) => schema.parse(data);

const date = z.iso.date();

const email = z.email().max(254);

const authSchema = z.object({ email, password: z.string().min(8).max(128) });

const registerSchema = authSchema.extend({
    name: z.string().trim().min(2).max(150),
    phone: z.string().trim().max(30).optional(),
    role: z.string().trim().max(12),
});

const tokenFor = (u) =>
    jwt.sign({ sub: String(u.id), role: u.role }, process.env.JWT_SECRET, {
        expiresIn: "2h",
        issuer: "hotel-real",
        audience: "hotel-real-web",
    });

const publicUser = (u) => ({
    id: Number(u.id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
});

const auth = asyncHandler(async (req, res, next) => {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer "))
        return res.status(401).json({ error: { message: "Token requerido" } });
    let payload;
    try {
        payload = jwt.verify(h.slice(7), process.env.JWT_SECRET, {
            issuer: "hotel-real",
            audience: "hotel-real-web",
        });
    } catch {
        return res
            .status(401)
            .json({ error: { message: "Token inválido o vencido" } });
    }
    const { rows } = await pool.query(
        "SELECT id,name,email,phone,role FROM users WHERE id=$1",
        [payload.sub],
    );
    if (!rows[0])
        return res.status(401).json({ error: { message: "Usuario inexistente" } });
    req.user = rows[0];
    next();
});

const admin = (req, res, next) =>
    req.user.role === "admin"
        ? next()
        : res.status(403).json({ error: { message: "Acceso denegado" } });

app.post(
    "/api/auth/register",
    asyncHandler(async (req, res) => {
        const d = validate(registerSchema, req.body);
        const hash = await bcrypt.hash(d.password, 12);
        const { rows } = await pool.query(
            "INSERT INTO users(name,email,phone,password_hash, role) " +
            "VALUES($1,lower($2),$3,$4, $5) RETURNING id,name,email,phone,role",
            [d.name, d.email, d.phone || null, hash, d.role],
        );
        ok(res, { user: publicUser(rows[0]), token: tokenFor(rows[0]) }, 201);
    }),
);

app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
        const d = validate(authSchema, req.body);
        const { rows } = await pool.query(
            "SELECT * FROM users WHERE email=lower($1)",
            [d.email],
        );
        if (!rows[0] || !(await bcrypt.compare(d.password, rows[0].password_hash)))
            return res
                .status(401)
                .json({ error: { message: "Credenciales incorrectas" } });
        ok(res, { user: publicUser(rows[0]), token: tokenFor(rows[0]) });
    }),
);

app.get("/api/auth/me", auth, (req, res) => ok(res, publicUser(req.user)));


const roomSelect =
    "SELECT id,name,type,guests,beds,price::float8 AS price,image,tag,description,features FROM rooms";
app.get(
    "/api/rooms",
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            roomSelect + " WHERE active=true ORDER BY id",
        );
        ok(
            res,
            rows.map((r) => ({ ...r, id: Number(r.id) })),
        );
    }),
);

const roomSchema = z.object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["Sencilla", "Doble", "Suite"]),
    price: z.number().positive().max(1000000),
    guests: z.number().int().min(1).max(20).default(2),
    beds: z.string().max(100).default("1 cama queen"),
    image: z.string().max(2000).default(""),
    tag: z.string().max(100).default("Disponible"),
    description: z.string().max(3000).default(""),
    features: z.array(z.string().max(100)).max(20).default([]),
});

app.post(
    "/api/rooms",
    auth,
    admin,
    asyncHandler(async (req, res) => {
        const d = validate(roomSchema, req.body);
        const { rows } = await pool.query(
            "INSERT INTO rooms(name,type,price,guests,beds,image,tag,description,features) " +
            "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [
                d.name,
                d.type,
                d.price,
                d.guests,
                d.beds,
                d.image,
                d.tag,
                d.description,
                d.features,
            ],
        );
        ok(res, rows[0], 201);
    }),
);

const bookingSelect = `SELECT b.id,r.name AS "roomName",r.type AS "roomType",r.image,b.total::float8 AS total,` +
    `to_char(b.check_in,'YYYY-MM-DD')||'T15:00:00-06:00' AS "checkIn",` +
    `to_char(b.check_out,'YYYY-MM-DD')||'T12:00:00-06:00' AS "checkOut",` +
    `b.payment_method AS "paymentMethod",b.status,u.name AS guest ` +
    `FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN users u ON u.id=b.user_id`;
app.get(
    "/api/bookings",
    auth,
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            bookingSelect + " WHERE b.user_id=$1 ORDER BY b.created_at DESC",
            [req.user.id],
        );
        ok(res, rows);
    }),
);

const bookingSchema = z.object({
    roomId: z.number().int().positive(),
    checkIn: date,
    checkOut: date,
    guests: z.number().int().min(1).max(20),
    paymentMethod: z.enum(["Simulado (sin cobro)"]),
});

app.post(
    "/api/bookings",
    auth,
    asyncHandler(async (req, res) => {
        const d = validate(bookingSchema, req.body);
        const key = req.get("Idempotency-Key");
        if (!key || key.length > 80)
            return res
                .status(400)
                .json({
                    error: {
                        message: "Idempotency-Key requerido (máximo 80 caracteres)",
                    },
                });
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const old = await client.query(
                "SELECT id FROM bookings WHERE user_id=$1 AND idempotency_key=$2",
                [req.user.id, key],
            );
            if (old.rows[0]) {
                await client.query("COMMIT");
                return ok(res, { id: old.rows[0].id });
            }
            const room = await client.query(
                "SELECT * FROM rooms WHERE id=$1 AND active=true FOR SHARE",
                [d.roomId],
            );
            if (!room.rows[0])
                return await rollbackError(
                    client,
                    res,
                    404,
                    "Habitación no encontrada",
                );
            if (d.guests > room.rows[0].guests)
                return await rollbackError(
                    client,
                    res,
                    400,
                    "La cantidad de huéspedes supera la capacidad",
                );
            const dates = await client.query(
                "SELECT ($2::date-$1::date) AS nights,($1::date>CURRENT_DATE) AS future",
                [d.checkIn, d.checkOut],
            );
            const nights = dates.rows[0].nights;
            if (nights < 1 || nights > 365 || !dates.rows[0].future)
                return await rollbackError(
                    client,
                    res,
                    400,
                    "Fechas de estancia inválidas",
                );
            const total = Number(room.rows[0].price) * nights + 620;
            const result = await client.query(
                `INSERT INTO bookings(user_id,room_id,check_in,check_out,guests,nightly_rate,` +
                `total,payment_method,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [
                    req.user.id,
                    d.roomId,
                    d.checkIn,
                    d.checkOut,
                    d.guests,
                    room.rows[0].price,
                    total,
                    d.paymentMethod,
                    key,
                ],
            );
            await client.query("COMMIT");
            ok(res, { id: result.rows[0].id }, 201);
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }),
);

async function rollbackError(client, res, status, message) {
    await client.query("ROLLBACK");
    return res.status(status).json({ error: { message } });
}

app.patch(
    "/api/bookings/:id/cancel",
    auth,
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `UPDATE bookings SET status='Cancelada',cancelled_at=now() ` +
            `WHERE id=$1 AND (user_id=$2 OR $3='admin') AND status='Confirmada' ` +
            `AND (check_in::timestamp+time '15:00')> (now() AT TIME ZONE 'America/Mexico_City')+interval '24 hours' ` +
            `RETURNING id`,
            [req.params.id, req.user.id, req.user.role],
        );
        if (!rows[0])
            return res
                .status(409)
                .json({
                    error: {
                        message: "No se puede cancelar esta reserva (estado o plazo)",
                    },
                });
        ok(res, { id: rows[0].id, status: "Cancelada" });
    }),
);

const contactSchema = z.object({
    name: z.string().trim().min(2).max(150),
    email,
    subject: z.string().min(2).max(100),
    message: z.string().trim().min(5).max(5000),
});

app.post(
    "/api/contact",
    optionalAuth,
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }),
    asyncHandler(async (req, res) => {
        const d = validate(contactSchema, req.body);
        const userId = req.user?.id ?? null;
        const { rows } = await pool.query(
            `INSERT INTO contact_messages(user_id, name,email,subject,message) VALUES($1,$2,$3,$4, $5)
            RETURNING id, user_id, name, email, subject, message`,
            [userId, d.name, d.email, d.subject, d.message],
        );
        // ok(res, { received: true }, 201);
        ok(res, {
            message: "Mensaje registrado correctamente",
            contact: rows[0]
        }, 201);
    }),
);

app.get(
    "/api/admin/bookings",
    auth,
    admin,
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            bookingSelect + " ORDER BY b.created_at DESC LIMIT 200",
        );
        ok(res, rows);
    }),
);

app.get(
    "/api/admin/metrics",
    auth,
    admin,
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT (SELECT count(*)::int FROM rooms WHERE active) AS rooms,` +
            `(SELECT count(*)::int FROM bookings WHERE status='Confirmada' ` +
            `AND CURRENT_DATE>=check_in AND CURRENT_DATE<check_out) AS occupied,(SELECT count(*)::int ` +
            `FROM bookings WHERE status='Confirmada' AND check_in=CURRENT_DATE) AS arrivals,` +
            `(SELECT count(*)::int FROM bookings WHERE status='Confirmada' ` +
            `AND check_out=CURRENT_DATE) AS departures,(SELECT coalesce(sum(total),0)::float8 ` + `
            FROM bookings WHERE status='Confirmada' AND date_trunc('month',created_at)=date_trunc('month',now())) ` +
            `AS revenue`,
        );
        const m = rows[0];
        ok(res, {
            ...m,
            occupancy: m.rooms ? Math.round((100 * m.occupied) / m.rooms) : 0,
        });
    }),
);

app.get(
    "/api/health",
    asyncHandler(async (req, res) => {
        await pool.query("SELECT 1");
        ok(res, { status: "ok" });
    }),
);

app.use((req, res) =>
    res.status(404).json({ error: { message: "Ruta no encontrada" } }),
);

app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
        return res
            .status(400)
            .json({ error: { message: "Datos inválidos", details: err.issues } });
    if (err.code === "23505")
        return res
            .status(409)
            .json({ error: { message: "El registro ya existe" } });
    if (err.code === "23P01")
        return res
            .status(409)
            .json({ error: { message: "Habitación ocupada en ese periodo" } });
    console.error(err);
    res.status(500).json({ error: { message: "Error interno" } });
});

app.listen(Number(process.env.PORT) || 3000, () => console.log("API iniciada"));
