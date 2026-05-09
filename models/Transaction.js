const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['PAGO', 'GASTO_REPUESTO', 'AJUSTE'],
      required: [true, 'El tipo de transacción es requerido'],
    },
    monto: {
      type: Number,
      required: [true, 'El monto es requerido'],
      min: 0,
    },
    descripcion: {
      type: String,
      trim: true,
    },
    // Foto del comprobante (para PAGO) o del repuesto (para GASTO_REPUESTO)
    comprobante_url: {
      type: String,
      default: null,
    },
    // KM al momento del pago (obligatorio si tipo === 'PAGO')
    km_al_pago: {
      type: Number,
      min: 0,
      default: null,
    },
    // Estado del pago
    estado: {
      type: String,
      enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
      default: 'PENDIENTE',
    },
    // Quién creó la transacción
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Quién aprobó/rechazó (solo OWNER)
    aprobadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fechaAprobacion: {
      type: Date,
      default: null,
    },
    // Moto relacionada
    motocicleta: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Motorcycle',
      required: true,
    },
    // Si el gasto de repuesto aplica al driver
    aplica_a_driver: {
      type: Boolean,
      default: false,
    },
    // Período al que corresponde (mes/año)
    periodo_mes: {
      type: Number,
      min: 1,
      max: 12,
    },
    periodo_anio: {
      type: Number,
    },
  },
  { timestamps: true }
);

// Auto-asignar período al crear
TransactionSchema.pre('save', function (next) {
  if (!this.periodo_mes || !this.periodo_anio) {
    const now = new Date();
    this.periodo_mes = now.getMonth() + 1;
    this.periodo_anio = now.getFullYear();
  }
  next();
});

module.exports = mongoose.model('Transaction', TransactionSchema);
