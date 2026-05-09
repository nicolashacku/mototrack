const express = require('express');
const router = express.Router();
const Motorcycle = require('../models/Motorcycle');
const User = require('../models/User');
const { protect, onlyOwner } = require('../middleware/auth');

// @route  GET /api/motorcycles
// @desc   Obtener motos (OWNER: sus motos | DRIVER: su moto)
// @access Private
router.get('/', protect, async (req, res) => {
  try {
    let motos;
    if (req.user.rol === 'OWNER') {
      motos = await Motorcycle.find({ owner: req.user._id, activa: true })
        .populate('driver', 'nombre email');
    } else {
      // DRIVER solo ve su moto asignada
      const user = await User.findById(req.user._id).populate('motocicleta');
      motos = user.motocicleta ? [user.motocicleta] : [];
    }
    res.json({ success: true, data: motos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  POST /api/motorcycles
// @desc   Crear moto (solo OWNER)
// @access Private/OWNER
router.post('/', protect, onlyOwner, async (req, res) => {
  try {
    const { placa, marca, modelo, anio, color, km_actual, km_ultimo_aceite, tarifa_mensual } = req.body;

    const moto = await Motorcycle.create({
      placa,
      marca,
      modelo,
      anio,
      color,
      km_actual,
      km_ultimo_aceite,
      tarifa_mensual,
      owner: req.user._id,
    });

    res.status(201).json({ success: true, data: moto });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'La placa ya está registrada.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  PUT /api/motorcycles/:id/assign-driver
// @desc   Asignar driver a moto (solo OWNER)
// @access Private/OWNER
router.put('/:id/assign-driver', protect, onlyOwner, async (req, res) => {
  try {
    const { driverId } = req.body;
    const moto = await Motorcycle.findOne({ _id: req.params.id, owner: req.user._id });

    if (!moto) {
      return res.status(404).json({ success: false, message: 'Moto no encontrada.' });
    }

    const driver = await User.findOne({ _id: driverId, rol: 'DRIVER' });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver no encontrado.' });
    }

    // Asignar moto al driver
    moto.driver = driverId;
    await moto.save();

    // Asignar moto al usuario driver
    driver.motocicleta = moto._id;
    driver.owner = req.user._id;
    await driver.save();

    res.json({ success: true, data: moto, message: 'Driver asignado correctamente.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  PUT /api/motorcycles/:id/aceite
// @desc   Registrar cambio de aceite (OWNER actualiza km_ultimo_aceite)
// @access Private/OWNER
router.put('/:id/aceite', protect, onlyOwner, async (req, res) => {
  try {
    const moto = await Motorcycle.findOne({ _id: req.params.id, owner: req.user._id });
    if (!moto) {
      return res.status(404).json({ success: false, message: 'Moto no encontrada.' });
    }

    moto.km_ultimo_aceite = moto.km_actual;
    await moto.save();

    res.json({
      success: true,
      data: moto,
      message: `Aceite actualizado. Próximo cambio a los ${moto.km_actual + moto.km_alerta_aceite} km.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  GET /api/motorcycles/:id
// @desc   Detalle de moto
// @access Private
router.get('/:id', protect, async (req, res) => {
  try {
    const moto = await Motorcycle.findById(req.params.id)
      .populate('owner', 'nombre email')
      .populate('driver', 'nombre email');

    if (!moto) {
      return res.status(404).json({ success: false, message: 'Moto no encontrada.' });
    }

    // Verificar acceso
    const isOwner = moto.owner._id.toString() === req.user._id.toString();
    const isDriver = moto.driver && moto.driver._id.toString() === req.user._id.toString();

    if (!isOwner && !isDriver) {
      return res.status(403).json({ success: false, message: 'Sin acceso a esta moto.' });
    }

    res.json({ success: true, data: moto });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
