const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Motorcycle = require('../models/Motorcycle');
const { protect, onlyOwner } = require('../middleware/auth');

// @route  GET /api/users/drivers
// @desc   OWNER lista todos sus drivers
// @access Private/OWNER
router.get('/drivers', protect, onlyOwner, async (req, res) => {
  try {
    const drivers = await User.find({ owner: req.user._id, rol: 'DRIVER' })
      .populate('motocicleta', 'placa marca modelo km_actual');

    res.json({ success: true, data: drivers, total: drivers.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  GET /api/users/drivers/sin-moto
// @desc   OWNER lista drivers sin moto asignada
// @access Private/OWNER
router.get('/drivers/sin-moto', protect, onlyOwner, async (req, res) => {
  try {
    const drivers = await User.find({
      owner: req.user._id,
      rol: 'DRIVER',
      motocicleta: null,
    });
    res.json({ success: true, data: drivers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  PUT /api/users/:id/desactivar
// @desc   OWNER desactiva un driver
// @access Private/OWNER
router.put('/:id/desactivar', protect, onlyOwner, async (req, res) => {
  try {
    const driver = await User.findOne({ _id: req.params.id, owner: req.user._id });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver no encontrado.' });
    }

    driver.activo = false;
    await driver.save();

    // Liberar moto si tenía
    if (driver.motocicleta) {
      await Motorcycle.findByIdAndUpdate(driver.motocicleta, { driver: null });
      driver.motocicleta = null;
      await driver.save();
    }

    res.json({ success: true, message: 'Driver desactivado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  GET /api/users/resumen
// @desc   Resumen general para el OWNER
// @access Private/OWNER
router.get('/resumen', protect, onlyOwner, async (req, res) => {
  try {
    const [totalMotos, motosConAlerta, totalDrivers] = await Promise.all([
      Motorcycle.countDocuments({ owner: req.user._id, activa: true }),
      Motorcycle.countDocuments({
        owner: req.user._id,
        activa: true,
        $expr: { $gt: [{ $subtract: ['$km_actual', '$km_ultimo_aceite'] }, '$km_alerta_aceite'] },
      }),
      User.countDocuments({ owner: req.user._id, rol: 'DRIVER', activo: true }),
    ]);

    res.json({
      success: true,
      data: { totalMotos, motosConAlerta, totalDrivers },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
