/**
 * Script de semilla para poblar MotoTrack con datos de prueba
 * Uso: node seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Modelos
const User = require('./models/User');
const Motorcycle = require('./models/Motorcycle');
const Transaction = require('./models/Transaction');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB conectado');
};

const seed = async () => {
  await connectDB();

  // Limpiar colecciones
  console.log('🗑️  Limpiando base de datos...');
  await User.deleteMany({});
  await Motorcycle.deleteMany({});
  await Transaction.deleteMany({});

  // ── Crear OWNER ──────────────────────────────────────────
  console.log('👑 Creando OWNER...');
  const owner = await User.create({
    nombre: 'Nicolás Rodríguez',
    email: 'nicolas@mototrack.com',
    password: '123456',
    rol: 'OWNER',
  });

  // ── Crear DRIVERs ─────────────────────────────────────────
  console.log('🏍️  Creando DRIVERs...');
  const driver1 = await User.create({
    nombre: 'Carlos Martínez',
    email: 'carlos@mototrack.com',
    password: '123456',
    rol: 'DRIVER',
    owner: owner._id,
  });

  const driver2 = await User.create({
    nombre: 'Andrés López',
    email: 'andres@mototrack.com',
    password: '123456',
    rol: 'DRIVER',
    owner: owner._id,
  });

  const driver3 = await User.create({
    nombre: 'Pedro Gómez',
    email: 'pedro@mototrack.com',
    password: '123456',
    rol: 'DRIVER',
    owner: owner._id,
  });

  // ── Crear Motos ───────────────────────────────────────────
  console.log('🔧 Creando motos...');

  // Moto 1: Necesita aceite urgente (2100 km desde último aceite)
  const moto1 = await Motorcycle.create({
    placa: 'ABC123',
    marca: 'Honda',
    modelo: 'CB 150',
    anio: 2022,
    color: 'Rojo',
    km_actual: 15600,
    km_ultimo_aceite: 13500,  // 2100 km → ⚠️ ALERTA
    tarifa_mensual: 600000,
    owner: owner._id,
    driver: driver1._id,
  });

  // Moto 2: OK, sin alerta
  const moto2 = await Motorcycle.create({
    placa: 'XYZ456',
    marca: 'Yamaha',
    modelo: 'FZ 150',
    anio: 2021,
    color: 'Azul',
    km_actual: 22400,
    km_ultimo_aceite: 21800,  // 600 km → ✅ OK
    tarifa_mensual: 650000,
    owner: owner._id,
    driver: driver2._id,
  });

  // Moto 3: Sin driver asignado
  const moto3 = await Motorcycle.create({
    placa: 'MNO789',
    marca: 'Suzuki',
    modelo: 'GN 125',
    anio: 2023,
    color: 'Negro',
    km_actual: 8200,
    km_ultimo_aceite: 7500,   // 700 km → ✅ OK
    tarifa_mensual: 500000,
    owner: owner._id,
    driver: driver3._id,
  });

  // Asignar motos a drivers
  driver1.motocicleta = moto1._id;
  driver2.motocicleta = moto2._id;
  driver3.motocicleta = moto3._id;
  await driver1.save();
  await driver2.save();
  await driver3.save();

  // ── Crear Transacciones ────────────────────────────────────
  console.log('💰 Creando transacciones...');

  // Pagos de Carlos (driver1) - Moto ABC123
  const pago1 = await Transaction.create({
    tipo: 'PAGO',
    monto: 300000,
    descripcion: 'Pago semana 1 - Marzo',
    km_al_pago: 14200,
    creadoPor: driver1._id,
    motocicleta: moto1._id,
    estado: 'APROBADO',
    aprobadoPor: owner._id,
    fechaAprobacion: new Date('2024-03-08'),
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  const pago2 = await Transaction.create({
    tipo: 'PAGO',
    monto: 300000,
    descripcion: 'Pago semana 2 - Marzo',
    km_al_pago: 14900,
    creadoPor: driver1._id,
    motocicleta: moto1._id,
    estado: 'APROBADO',
    aprobadoPor: owner._id,
    fechaAprobacion: new Date('2024-03-15'),
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  // Pago pendiente (sin aprobar aún)
  const pagoPendiente = await Transaction.create({
    tipo: 'PAGO',
    monto: 300000,
    descripcion: 'Pago semana 3 - Marzo',
    km_al_pago: 15600,
    creadoPor: driver1._id,
    motocicleta: moto1._id,
    estado: 'PENDIENTE',
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  // Pago de Andrés (driver2) - Moto XYZ456
  await Transaction.create({
    tipo: 'PAGO',
    monto: 650000,
    descripcion: 'Pago mensual completo - Marzo',
    km_al_pago: 22400,
    creadoPor: driver2._id,
    motocicleta: moto2._id,
    estado: 'APROBADO',
    aprobadoPor: owner._id,
    fechaAprobacion: new Date('2024-03-20'),
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  // Gasto de repuesto (OWNER - aplica al driver)
  await Transaction.create({
    tipo: 'GASTO_REPUESTO',
    monto: 85000,
    descripcion: 'Pastillas de freno delanteras - ABC123',
    creadoPor: owner._id,
    motocicleta: moto1._id,
    aplica_a_driver: true,
    estado: 'APROBADO',
    aprobadoPor: owner._id,
    fechaAprobacion: new Date('2024-03-10'),
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  // Gasto de repuesto (NO aplica al driver - lo absorbe el OWNER)
  await Transaction.create({
    tipo: 'GASTO_REPUESTO',
    monto: 120000,
    descripcion: 'Llanta trasera - XYZ456',
    creadoPor: owner._id,
    motocicleta: moto2._id,
    aplica_a_driver: false,
    estado: 'APROBADO',
    aprobadoPor: owner._id,
    fechaAprobacion: new Date('2024-03-12'),
    periodo_mes: 3,
    periodo_anio: 2024,
  });

  // ── Resumen ───────────────────────────────────────────────
  console.log('\n✅ Base de datos poblada exitosamente!\n');
  console.log('═══════════════════════════════════════');
  console.log('  CREDENCIALES DE PRUEBA');
  console.log('═══════════════════════════════════════');
  console.log('👑 OWNER:');
  console.log('   Email:    nicolas@mototrack.com');
  console.log('   Password: 123456');
  console.log('\n🏍️  DRIVER 1 (con alerta de aceite):');
  console.log('   Email:    carlos@mototrack.com');
  console.log('   Password: 123456');
  console.log('   Moto:     Honda CB 150 - ABC123');
  console.log('\n🏍️  DRIVER 2 (al día):');
  console.log('   Email:    andres@mototrack.com');
  console.log('   Password: 123456');
  console.log('   Moto:     Yamaha FZ 150 - XYZ456');
  console.log('\n🏍️  DRIVER 3:');
  console.log('   Email:    pedro@mototrack.com');
  console.log('   Password: 123456');
  console.log('   Moto:     Suzuki GN 125 - MNO789');
  console.log('═══════════════════════════════════════\n');

  mongoose.disconnect();
};

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  mongoose.disconnect();
  process.exit(1);
});
