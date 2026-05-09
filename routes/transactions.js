const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Motorcycle = require('../models/Motorcycle');
const { protect, authorize, onlyOwner } = require('../middleware/auth');

// @route  GET /api/transactions
// @desc   Listar transacciones según rol
// @access Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    const { tipo, estado, moto_id } = req.query;

    if (req.user.rol === 'OWNER') {
      // OWNER ve todas las transacciones de sus motos
      const Motorcycle = require('../models/Motorcycle');
      const motos = await Motorcycle.find({ owner: req.user._id }).select('_id');
      query.motocicleta = { $in: motos.map((m) => m._id) };
    } else {
      // DRIVER solo ve las suyas o las de repuestos que le aplican
      query.$or = [
        { creadoPor: req.user._id },
        { motocicleta: req.user.motocicleta, aplica_a_driver: true, tipo: 'GASTO_REPUESTO' },
      ];
    }

    if (tipo) query.tipo = tipo;
    if (estado) query.estado = estado;
    if (moto_id) query.motocicleta = moto_id;

    const transactions = await Transaction.find(query)
      .populate('creadoPor', 'nombre rol')
      .populate('aprobadoPor', 'nombre')
      .populate('motocicleta', 'placa marca modelo')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: transactions, total: transactions.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  POST /api/transactions/pago
// @desc   DRIVER registra un pago (con KM obligatorio)
// @access Private/DRIVER
router.post('/pago', protect, authorize('DRIVER'), async (req, res) => {
  try {
    const { monto, descripcion, km_al_pago, comprobante_url } = req.body;

    if (!km_al_pago) {
      return res.status(400).json({ success: false, message: 'El KM al momento del pago es obligatorio.' });
    }

    if (!req.user.motocicleta) {
      return res.status(400).json({ success: false, message: 'No tienes una moto asignada.' });
    }

    // Obtener moto
    const moto = await Motorcycle.findById(req.user.motocicleta);
    if (!moto) {
      return res.status(404).json({ success: false, message: 'Moto no encontrada.' });
    }

    // Validar que el KM nuevo sea mayor al actual
    if (km_al_pago < moto.km_actual) {
      return res.status(400).json({
        success: false,
        message: `El KM ingresado (${km_al_pago}) no puede ser menor al KM actual (${moto.km_actual}).`,
      });
    }

    // Crear transacción
    const transaction = await Transaction.create({
      tipo: 'PAGO',
      monto,
      descripcion: descripcion || `Pago de arriendo`,
      km_al_pago,
      comprobante_url: comprobante_url || null,
      creadoPor: req.user._id,
      motocicleta: req.user.motocicleta,
      estado: 'PENDIENTE',
    });

    // ✅ Actualizar km_actual de la moto automáticamente
    moto.km_actual = km_al_pago;
    await moto.save();

    // Verificar alerta de aceite
    const kmDesdeAceite = moto.km_actual - moto.km_ultimo_aceite;
    const necesitaAceite = kmDesdeAceite > moto.km_alerta_aceite;

    const populated = await transaction.populate([
      { path: 'creadoPor', select: 'nombre rol' },
      { path: 'motocicleta', select: 'placa marca modelo km_actual km_desde_aceite necesita_aceite' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      alerta_aceite: necesitaAceite,
      km_desde_aceite: kmDesdeAceite,
      message: necesitaAceite
        ? `⚠️ Pago registrado. ALERTA: Han pasado ${kmDesdeAceite} km desde el último aceite.`
        : 'Pago registrado correctamente. Pendiente de aprobación.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  POST /api/transactions/gasto
// @desc   OWNER registra gasto de repuesto
// @access Private/OWNER
router.post('/gasto', protect, onlyOwner, async (req, res) => {
  try {
    const { monto, descripcion, moto_id, aplica_a_driver, comprobante_url } = req.body;

    const moto = await Motorcycle.findOne({ _id: moto_id, owner: req.user._id });
    if (!moto) {
      return res.status(404).json({ success: false, message: 'Moto no encontrada.' });
    }

    const transaction = await Transaction.create({
      tipo: 'GASTO_REPUESTO',
      monto,
      descripcion,
      comprobante_url: comprobante_url || null,
      creadoPor: req.user._id,
      motocicleta: moto_id,
      aplica_a_driver: aplica_a_driver || false,
      estado: 'APROBADO', // Los gastos del OWNER se auto-aprueban
      aprobadoPor: req.user._id,
      fechaAprobacion: new Date(),
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  PUT /api/transactions/:id/aprobar
// @desc   OWNER aprueba un pago
// @access Private/OWNER
router.put('/:id/aprobar', protect, onlyOwner, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('motocicleta');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transacción no encontrada.' });
    }

    if (transaction.tipo !== 'PAGO') {
      return res.status(400).json({ success: false, message: 'Solo se pueden aprobar pagos.' });
    }

    if (transaction.estado !== 'PENDIENTE') {
      return res.status(400).json({ success: false, message: 'Este pago ya fue procesado.' });
    }

    // Verificar que la moto pertenece al owner
    const moto = await Motorcycle.findOne({ _id: transaction.motocicleta._id, owner: req.user._id });
    if (!moto) {
      return res.status(403).json({ success: false, message: 'Sin permisos sobre esta moto.' });
    }

    transaction.estado = 'APROBADO';
    transaction.aprobadoPor = req.user._id;
    transaction.fechaAprobacion = new Date();
    await transaction.save();

    res.json({ success: true, data: transaction, message: 'Pago aprobado correctamente.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  PUT /api/transactions/:id/rechazar
// @desc   OWNER rechaza un pago
// @access Private/OWNER
router.put('/:id/rechazar', protect, onlyOwner, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.estado !== 'PENDIENTE') {
      return res.status(400).json({ success: false, message: 'Transacción no válida o ya procesada.' });
    }

    transaction.estado = 'RECHAZADO';
    transaction.aprobadoPor = req.user._id;
    transaction.fechaAprobacion = new Date();
    await transaction.save();

    res.json({ success: true, data: transaction, message: 'Pago rechazado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route  GET /api/transactions/balance
// @desc   Balance consolidado (OWNER) o deuda individual (DRIVER)
// @access Private
router.get('/balance', protect, async (req, res) => {
  try {
    if (req.user.rol === 'OWNER') {
      const Motorcycle = require('../models/Motorcycle');
      const motos = await Motorcycle.find({ owner: req.user._id }).select('_id tarifa_mensual');
      const motoIds = motos.map((m) => m._id);

      const pagosAprobados = await Transaction.aggregate([
        { $match: { motocicleta: { $in: motoIds }, tipo: 'PAGO', estado: 'APROBADO' } },
        { $group: { _id: null, total: { $sum: '$monto' } } },
      ]);

      const pagosPendientes = await Transaction.aggregate([
        { $match: { motocicleta: { $in: motoIds }, tipo: 'PAGO', estado: 'PENDIENTE' } },
        { $group: { _id: null, total: { $sum: '$monto' }, count: { $sum: 1 } } },
      ]);

      const gastos = await Transaction.aggregate([
        { $match: { motocicleta: { $in: motoIds }, tipo: 'GASTO_REPUESTO' } },
        { $group: { _id: null, total: { $sum: '$monto' } } },
      ]);

      res.json({
        success: true,
        data: {
          total_cobrado: pagosAprobados[0]?.total || 0,
          total_pendiente: pagosPendientes[0]?.total || 0,
          cobros_pendientes_count: pagosPendientes[0]?.count || 0,
          total_gastos: gastos[0]?.total || 0,
          balance_neto: (pagosAprobados[0]?.total || 0) - (gastos[0]?.total || 0),
        },
      });
    } else {
      // DRIVER: calcular su deuda
      if (!req.user.motocicleta) {
        return res.json({ success: true, data: { deuda_actual: 0, pagos_realizados: 0 } });
      }

      const moto = await Motorcycle.findById(req.user.motocicleta);

      const pagosAprobados = await Transaction.aggregate([
        { $match: { motocicleta: moto._id, creadoPor: req.user._id, tipo: 'PAGO', estado: 'APROBADO' } },
        { $group: { _id: null, total: { $sum: '$monto' } } },
      ]);

      const pagosPendientes = await Transaction.aggregate([
        { $match: { motocicleta: moto._id, creadoPor: req.user._id, tipo: 'PAGO', estado: 'PENDIENTE' } },
        { $group: { _id: null, total: { $sum: '$monto' } } },
      ]);

      const gastosAplicados = await Transaction.aggregate([
        { $match: { motocicleta: moto._id, tipo: 'GASTO_REPUESTO', aplica_a_driver: true } },
        { $group: { _id: null, total: { $sum: '$monto' } } },
      ]);

      const totalPagado = pagosAprobados[0]?.total || 0;
      const totalPendiente = pagosPendientes[0]?.total || 0;
      const totalGastos = gastosAplicados[0]?.total || 0;
      const deudaActual = (moto.tarifa_mensual + totalGastos) - totalPagado - totalPendiente;

      res.json({
        success: true,
        data: {
          deuda_actual: Math.max(0, deudaActual),
          tarifa_mensual: moto.tarifa_mensual,
          pagos_aprobados: totalPagado,
          pagos_pendientes: totalPendiente,
          gastos_aplicados: totalGastos,
          km_actual: moto.km_actual,
          km_desde_aceite: moto.km_actual - moto.km_ultimo_aceite,
          necesita_aceite: moto.km_actual - moto.km_ultimo_aceite > moto.km_alerta_aceite,
          km_para_aceite: Math.max(0, moto.km_alerta_aceite - (moto.km_actual - moto.km_ultimo_aceite)),
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
