const jwt = require("jsonwebtoken");

function optionalAuth(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        req.user = null;
        return next();
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            success: false,
            error: {
                code: "INVALID_TOKEN",
                message: "Token de autenticación inválido"
            }
        });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = {
            id: Number(decoded.sub),
            role: decoded.role
        };

        if (!Number.isSafeInteger(req.user.id) || req.user.id <= 0) {
            throw new Error("Identificador de usuario inválido");
        }

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            error: {
                code: "INVALID_TOKEN",
                message: "Token inválido o expirado"
            }
        });
    }
}

module.exports = optionalAuth;
