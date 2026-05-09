const mongoose = require('mongoose');

const MotorcycleSchema = new mongoose.Schema(
  {
    placa: {
      type: String,
      required: [true, 'La placa es requerida'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    marca: {
      type: String,
      required: [true, 'La marca es requerida'],
      trim: true,
    },
    modelo: {
      type: String,
      required: [true, 'El modelo es requerido'],
      trim: true,
    },
    anio: {
      type: Number,
      required: [true, 'El año es requerido'],
    },
    color: {
      type: String,
      trim: true,
    },
    // KM tracking
    km_actual: {
      type: Number,
      required: [true, 'El KM actual es requerido'],
      min: 0,
    },
    km_ultimo_aceite: {
      type: Number,
      required: [true, 'El KM del último aceite es requerido'],
      min: 0,
    },
    // Umbral de alerta de aceite (por defecto 2000 km)
    km_alerta_aceite: {
      type: Number,
      default: 2000,
    },
    // Propietario de la moto
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Driver asignado actualmente
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Tarifa de arriendo mensual
    tarifa_mensual: {
      type: Number,
      required: [true, 'La tarifa mensual es requerida'],
      min: 0,
    },
    activa: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: km desde último aceite
MotorcycleSchema.virtual('km_desde_aceite').get(function () {
  return this.km_actual - this.km_ultimo_aceite;
});

// Virtual: necesita aceite
MotorcycleSchema.virtual('necesita_aceite').get(function () {
  return this.km_actual - this.km_ultimo_aceite > this.km_alerta_aceite;
});

module.exports = mongoose.model('Motorcycle', MotorcycleSchema);
