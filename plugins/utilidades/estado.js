const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');
const { version: baileysVersion } = require('@whiskeysockets/baileys/package.json');

// Función auxiliar para formatear tiempo
function formatearTiempo(ms) {
    const segundos = Math.floor(ms / 1000);
    const dias = Math.floor(segundos / (24 * 60 * 60));
    const horas = Math.floor((segundos % (24 * 60 * 60)) / (60 * 60));
    const minutos = Math.floor((segundos % (60 * 60)) / 60);
    const segs = segundos % 60;

    const partes = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}m`);
    if (segs > 0 || partes.length === 0) partes.push(`${segs}s`);

    return partes.join(' ');
}

module.exports = {
    command: ['infobot', 'status', 'estado', 'ping'],
    description: 'Mostrar información del estado del bot',
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Obtener estadísticas del sistema
            const uptime = process.uptime();
            const memoria = process.memoryUsage();
            const memoriaUsada = Math.round(memoria.rss / 1024 / 1024);
            const memoriaHeap = Math.round(memoria.heapUsed / 1024 / 1024);

            // Formatear tiempo de actividad
            const uptimeFormateado = formatearTiempo(uptime * 1000);

            // Obtener información de la sesión
            const estadoConexion = sock.ws?.readyState === 1 ? '🟢 Conectado' : '🔴 Desconectado';

            // Intentar obtener métricas del bot si están disponibles
            let mensajesProcesados = 'N/A';
            let comandosEjecutados = 'N/A';

            try {
                const bot = require('../../main');
                if (bot.obtenerMetrics) {
                    const metrics = bot.obtenerMetrics();
                    mensajesProcesados = metrics.mensajesProcesados || 0;
                    comandosEjecutados = metrics.comandosEjecutados || 0;
                }
            } catch (error) {
                Logger.debug('No se pudieron obtener métricas adicionales');
            }

            const infoMsg = `🛡️ *INFORMACIÓN DEL BOT* 🛡️

🤖 *Nombre:* ${Config.bot.nombre}
⚡ *Prefijo:* ${Config.bot.prefix}
📦 *Versión:* ${Config.bot.version}
🔧 *Baileys:* v${baileysVersion}

📊 *Estadísticas:*
⏰ *Activo:* ${uptimeFormateado}
📨 *Mensajes:* ${mensajesProcesados}
🔧 *Comandos:* ${comandosEjecutados}
📡 *Conexión:* ${estadoConexion}

💾 *Memoria:*
• RSS: ${memoriaUsada}MB
• Heap: ${memoriaHeap}MB

💻 *Sistema:*
• Node.js: ${process.version}
• Plataforma: ${process.platform}

🛡️ *Protegiendo tus grupos 24/7*`;

            await sock.sendMessage(jid, { text: infoMsg }, { quoted: message });
            Logger.info(`✅ InfoBot enviado a ${jid}`);

        } catch (error) {
            Logger.error('Error en comando infobot:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al obtener información del bot.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje de error:', sendError);
            }
        }
    }
};