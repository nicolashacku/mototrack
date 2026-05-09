const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Motorcycle = require('../models/Motorcycle');
const { protect } = require('../middleware/auth');

// Generar JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @route  POST /api/auth/register
// @desc   Registrar usuario
// @access Public
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, rol, owner } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado.' });
    }

    // Si es DRIVER, verificar que el owner existe
    if (rol === 'DRIVER' && owner) {
      const ownerExists = await User.findById(owner);
      if (!ownerExists || ownerExists.rol !== 'OWNER') {
        return res.status(400).json({ success: false, message: 'El Owner especificado no existe.' });
      }
    }

    const user = await User.create({ nombre, email, password, rol, owner: rol === 'DRIVER' ? owner : null });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  POST /api/auth/login
// @desc   Iniciar sesión
// @access Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos.' });
    }

    const user = await User.findOne({ email }).select('+password').populate('motocicleta');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    if (!user.activo) {
      return res.status(401).json({ success: false, message: 'Cuenta desactivada.' });
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        motocicleta: user.motocicleta,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  GET /api/auth/me
// @desc   Obtener usuario actual
// @access Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('motocicleta');
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
