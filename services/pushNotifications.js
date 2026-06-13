const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Envía una notificación push a uno o más tokens.
 * @param {string[]} tokens  - Array de Expo push tokens
 * @param {string}   title
 * @param {string}   body
 * @param {object}   data    - Payload extra (para navegación en la app)
 */
async function sendPush(tokens, title, body, data = {}) {
  // Filtrar tokens válidos
  const validTokens = tokens.filter(t => t && Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const messages = validTokens.map(token => ({
    to:    token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'mototrack',
  }));

  // Agrupar en chunks (Expo recomienda máx 100 por lote)
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Log de errores sin bloquear
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          console.warn(`[Push] Error token ${validTokens[i]}:`, ticket.message);
        }
      });
    } catch (err) {
      console.error('[Push] Error enviando chunk:', err.message);
    }
  }
}

// ── Helpers por evento ────────────────────────────────────────────────────────

/**
 * DRIVER registró un pago → notificar al OWNER
 */
async function notifyOwnerPagoPendiente(ownerTokens, driverName, motoPlaca, monto) {
  const montoFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(monto);
  await sendPush(
    ownerTokens,
    'Pago pendiente de aprobación',
    `${driverName} registró ${montoFmt} · ${motoPlaca}`,
    { screen: 'transactions' }
  );
}

/**
 * OWNER aprobó un pago → notificar al DRIVER
 */
async function notifyDriverPagoAprobado(driverTokens, monto) {
  const montoFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(monto);
  await sendPush(
    driverTokens,
    'Pago aprobado',
    `Tu pago de ${montoFmt} fue aprobado.`,
    { screen: 'transactions' }
  );
}

/**
 * OWNER rechazó un pago → notificar al DRIVER
 */
async function notifyDriverPagoRechazado(driverTokens, monto) {
  const montoFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(monto);
  await sendPush(
    driverTokens,
    'Pago rechazado',
    `Tu pago de ${montoFmt} fue rechazado. Comunícate con el propietario.`,
    { screen: 'transactions' }
  );
}

/**
 * KM de aceite superado → notificar al DRIVER
 */
async function notifyDriverAceiteUrgente(driverTokens, motoPlaca, kmDesde) {
  await sendPush(
    driverTokens,
    'Cambio de aceite requerido',
    `${motoPlaca} lleva ${kmDesde.toLocaleString()} km desde el último cambio.`,
    { screen: 'motos' }
  );
}

/**
 * OWNER registró un gasto que aplica al driver → notificar al DRIVER
 */
async function notifyDriverGastoAplicado(driverTokens, descripcion, monto) {
  const montoFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(monto);
  await sendPush(
    driverTokens,
    'Nuevo gasto aplicado',
    `${descripcion}: ${montoFmt} fue agregado a tu cuenta.`,
    { screen: 'transactions' }
  );
}

module.exports = {
  sendPush,
  notifyOwnerPagoPendiente,
  notifyDriverPagoAprobado,
  notifyDriverPagoRechazado,
  notifyDriverAceiteUrgente,
  notifyDriverGastoAplicado,
};
