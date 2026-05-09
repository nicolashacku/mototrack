const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware: verificar token JWT
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No autorizado. Token requerido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user || !req.user.activo) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado o inactivo.' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado.' });
  }
};

// Middleware: restricción por rol
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      });
    }
    next();
  };
};

// Solo OWNER
const onlyOwner = authorize('OWNER');

// Solo DRIVER
const onlyDriver = authorize('DRIVER');

module.exports = { protect, authorize, onlyOwner, onlyDriver };
