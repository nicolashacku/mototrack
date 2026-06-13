const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Motorcycle  = require('../models/Motorcycle');
const User        = require('../models/User');
const { protect, authorize, onlyOwner } = require('../middleware/auth');
const {
  notifyOwnerPagoPendiente,
  notifyDriverPagoAprobado,
  notifyDriverPagoRechazado,
  notifyDriverGastoAplicado,
  notifyDriverAceiteUrgente,
} = require('../services/pushNotifications');

// ─── GET /api/transactions ────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    const { tipo, estado, moto_id } = req.query;

    if (req.user.rol === 'OWNER') {
      const motos = await Motorcycle.find({ owner: req.user._id }).select('_id');
      query.motocicleta = { $in: motos.map(m => m._id) };
    } else {
      query.$or = [
        { creadoPor: req.user._id },
        { motocicleta: req.user.motocicleta, aplica_a_driver: true, tipo: 'GASTO_REPUESTO' },
      ];
    }

    if (tipo)    query.tipo = tipo;
    if (estado)  query.estado = estado;
    if (moto_id) query.motocicleta = moto_id;

    const transactions = await Transaction.find(query)
      .populate('creadoPor',   'nombre rol')
      .populate('aprobadoPor', 'nombre')
      .populate('motocicleta', 'placa marca modelo')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: transactions, total: transactions.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/transactions/pago (DRIVER o OWNER pueden registrar KM) ────────
router.post('/pago', protect, async (req, res) => {
  try {
    const { monto, descripcion, km_al_pago, comprobante_url, moto_id } = req.body;

    if (!km_al_pago) {
      return res.status(400).json({ success: false, message: 'El KM al momento del pago es obligatorio.' });
    }

    // Determinar la moto: DRIVER usa la suya, OWNER especifica moto_id
    let motoId = req.user.rol === 'DRIVER' ? req.user.motocicleta : moto_id;
    if (!motoId) {
      return res.status(400).json({ success: false, message: 'No se determinó la moto. Especifica moto_id.' });
    }

    const moto = await Motorcycle.findById(motoId).populate('driver', 'nombre pushToken');
    if (!moto) return res.status(404).json({ success: false, message: 'Moto no encontrada.' });

    // Validar acceso
    const isOwner  = req.user.rol === 'OWNER' && moto.owner.toString() === req.user._id.toString();
    const isDriver = req.user.rol === 'DRIVER' && moto.driver?._id.toString() === req.user._id.toString();
    if (!isOwner && !isDriver) {
      return res.status(403).json({ success: false, message: 'Sin acceso a esta moto.' });
    }

    if (km_al_pago < moto.km_actual) {
      return res.status(400).json({
        success: false,
        message: `KM ingresado (${km_al_pago}) no puede ser menor al actual (${moto.km_actual}).`,
      });
    }

    // Crear transacción
    const transaction = await Transaction.create({
      tipo: 'PAGO',
      monto,
      descripcion: descripcion || 'Pago de arriendo',
      km_al_pago,
      comprobante_url: comprobante_url || null,
      creadoPor: req.user._id,
      motocicleta: motoId,
      estado: 'PENDIENTE',
    });

    // ✅ Actualizar KM de la moto
    moto.km_actual = km_al_pago;
    await moto.save();

    // Alerta aceite
    const kmDesdeAceite = moto.km_actual - moto.km_ultimo_aceite;
    const necesitaAceite = kmDesdeAceite > moto.km_alerta_aceite;

    // ── Push al OWNER (si fue el DRIVER quien pagó) ──
    if (isDriver) {
      const owner = await User.findById(moto.owner);
      if (owner?.pushToken) {
        notifyOwnerPagoPendiente(
          [owner.pushToken],
          req.user.nombre,
          moto.placa,
          monto
        ).catch(console.error);
      }
    }

    // ── Push al DRIVER por aceite urgente ──
    if (necesitaAceite && moto.driver?.pushToken) {
      notifyDriverAceiteUrgente(
        [moto.driver.pushToken],
        moto.placa,
        kmDesdeAceite
      ).catch(console.error);
    }

    const populated = await transaction.populate([
      { path: 'creadoPor',   select: 'nombre rol' },
      { path: 'motocicleta', select: 'placa marca modelo km_actual' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      alerta_aceite: necesitaAceite,
      km_desde_aceite: kmDesdeAceite,
      message: necesitaAceite
        ? `Pago registrado. Alerta: ${kmDesdeAceite} km desde el último aceite.`
        : 'Pago registrado. Pendiente de aprobación.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/transactions/gasto (solo OWNER) ───────────────────────────────
router.post('/gasto', protect, onlyOwner, async (req, res) => {
  try {
    const { monto, descripcion, moto_id, aplica_a_driver, comprobante_url } = req.body;

    const moto = await Motorcycle.findOne({ _id: moto_id, owner: req.user._id })
      .populate('driver', 'nombre pushToken');
    if (!moto) return res.status(404).json({ success: false, message: 'Moto no encontrada.' });

    const transaction = await Transaction.create({
      tipo: 'GASTO_REPUESTO',
      monto,
      descripcion,
      comprobante_url: comprobante_url || null,
      creadoPor: req.user._id,
      motocicleta: moto_id,
      aplica_a_driver: aplica_a_driver || false,
      estado: 'APROBADO',
      aprobadoPor: req.user._id,
      fechaAprobacion: new Date(),
    });

    // ── Push al DRIVER si el gasto le aplica ──
    if (aplica_a_driver && moto.driver?.pushToken) {
      notifyDriverGastoAplicado(
        [moto.driver.pushToken],
        descripcion,
        monto
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/transactions/:id/aprobar ───────────────────────────────────────
router.put('/:id/aprobar', protect, onlyOwner, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('motocicleta')
      .populate('creadoPor', 'nombre pushToken');

    if (!transaction) return res.status(404).json({ success: false, message: 'Transacción no encontrada.' });
    if (transaction.tipo !== 'PAGO') return res.status(400).json({ success: false, message: 'Solo se pueden aprobar pagos.' });
    if (transaction.estado !== 'PENDIENTE') return res.status(400).json({ success: false, message: 'Este pago ya fue procesado.' });

    const moto = await Motorcycle.findOne({ _id: transaction.motocicleta._id, owner: req.user._id });
    if (!moto) return res.status(403).json({ success: false, message: 'Sin permisos sobre esta moto.' });

    transaction.estado = 'APROBADO';
    transaction.aprobadoPor = req.user._id;
    transaction.fechaAprobacion = new Date();
    await transaction.save();

    // ── Push al DRIVER ──
    if (transaction.creadoPor?.pushToken) {
      notifyDriverPagoAprobado(
        [transaction.creadoPor.pushToken],
        transaction.monto
      ).catch(console.error);
    }

    res.json({ success: true, data: transaction, message: 'Pago aprobado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/transactions/:id/rechazar ──────────────────────────────────────
router.put('/:id/rechazar', protect, onlyOwner, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('creadoPor', 'nombre pushToken');

    if (!transaction || transaction.estado !== 'PENDIENTE') {
      return res.status(400).json({ success: false, message: 'Transacción no válida o ya procesada.' });
    }

    transaction.estado = 'RECHAZADO';
    transaction.aprobadoPor = req.user._id;
    transaction.fechaAprobacion = new Date();
    await transaction.save();

    // ── Push al DRIVER ──
    if (transaction.creadoPor?.pushToken) {
      notifyDriverPagoRechazado(
        [transaction.creadoPor.pushToken],
        transaction.monto
      ).catch(console.error);
    }

    res.json({ success: true, data: transaction, message: 'Pago rechazado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/transactions/balance ───────────────────────────────────────────
router.get('/balance', protect, async (req, res) => {
  try {
    if (req.user.rol === 'OWNER') {
      const motos = await Motorcycle.find({ owner: req.user._id }).select('_id tarifa_mensual');
      const ids   = motos.map(m => m._id);

      const [cobrados, pendientes, gastos] = await Promise.all([
        Transaction.aggregate([
          { $match: { motocicleta: { $in: ids }, tipo: 'PAGO', estado: 'APROBADO' } },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ]),
        Transaction.aggregate([
          { $match: { motocicleta: { $in: ids }, tipo: 'PAGO', estado: 'PENDIENTE' } },
          { $group: { _id: null, total: { $sum: '$monto' }, count: { $sum: 1 } } },
        ]),
        Transaction.aggregate([
          { $match: { motocicleta: { $in: ids }, tipo: 'GASTO_REPUESTO' } },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          total_cobrado:          cobrados[0]?.total   || 0,
          total_pendiente:        pendientes[0]?.total  || 0,
          cobros_pendientes_count:pendientes[0]?.count  || 0,
          total_gastos:           gastos[0]?.total      || 0,
          balance_neto:           (cobrados[0]?.total || 0) - (gastos[0]?.total || 0),
        },
      });
    } else {
      if (!req.user.motocicleta) {
        return res.json({ success: true, data: { deuda_actual: 0, pagos_realizados: 0 } });
      }

      const moto = await Motorcycle.findById(req.user.motocicleta);

      const [aprobados, pendientes, gastosDriver] = await Promise.all([
        Transaction.aggregate([
          { $match: { motocicleta: moto._id, creadoPor: req.user._id, tipo: 'PAGO', estado: 'APROBADO' } },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ]),
        Transaction.aggregate([
          { $match: { motocicleta: moto._id, creadoPor: req.user._id, tipo: 'PAGO', estado: 'PENDIENTE' } },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ]),
        Transaction.aggregate([
          { $match: { motocicleta: moto._id, tipo: 'GASTO_REPUESTO', aplica_a_driver: true } },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ]),
      ]);

      const totalPagado    = aprobados[0]?.total    || 0;
      const totalPendiente = pendientes[0]?.total   || 0;
      const totalGastos    = gastosDriver[0]?.total || 0;
      const deudaActual    = Math.max(0, (moto.tarifa_mensual + totalGastos) - totalPagado - totalPendiente);

      res.json({
        success: true,
        data: {
          deuda_actual:      deudaActual,
          tarifa_mensual:    moto.tarifa_mensual,
          pagos_aprobados:   totalPagado,
          pagos_pendientes:  totalPendiente,
          gastos_aplicados:  totalGastos,
          km_actual:         moto.km_actual,
          km_desde_aceite:   moto.km_actual - moto.km_ultimo_aceite,
          necesita_aceite:   moto.km_actual - moto.km_ultimo_aceite > moto.km_alerta_aceite,
          km_para_aceite:    Math.max(0, moto.km_alerta_aceite - (moto.km_actual - moto.km_ultimo_aceite)),
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/transactions/push-token (guardar token del dispositivo) ─────────
router.put('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    await User.findByIdAndUpdate(req.user._id, { pushToken: token });
    res.json({ success: true, message: 'Token registrado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
