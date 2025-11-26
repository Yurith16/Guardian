const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');

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
    command: ['estado', 'stats', 'info'],
    description: 'Ver estado y estadísticas del bot',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Obtener estadísticas básicas
            const uptime = process.uptime();
            const memoria = process.memoryUsage();
            const memoriaUsada = Math.round(memoria.rss / 1024 / 1024);
            const memoriaHeap = Math.round(memoria.heapUsed / 1024 / 1024);

            // Formatear tiempo
            const uptimeFormateado = formatearTiempo(uptime * 1000);

            // Obtener información de owners desde config/bot.json
            const globalOwner = Config.propietarios.global;
            const subOwners = Config.propietarios.subOwners || [];

            let ownersInfo = '';
            if (typeof globalOwner === 'object') {
                ownersInfo += `👑 Owner: ${globalOwner.numero}\n`;
            } else {
                ownersInfo += `👑 Owner: ${globalOwner}\n`;
            }

            ownersInfo += `👥 Sub-Owners: ${subOwners.length}`;

            // Intentar obtener métricas del bot
            let mensajesProcesados = 'N/A';
            let comandosEjecutados = 'N/A';
            let comandosTotales = 'N/A';
            let pluginsCargados = 'N/A';

            try {
                const bot = require('../../main');
                if (bot.obtenerMetrics) {
                    const metrics = bot.obtenerMetrics();
                    mensajesProcesados = metrics.mensajesProcesados || 0;
                    comandosEjecutados = metrics.comandosEjecutados || 0;
                }
                if (bot.gestorComandos) {
                    comandosTotales = bot.gestorComandos.contadorComandos || 0;
                    pluginsCargados = bot.gestorComandos.pluginsCargados || 0;
                }
            } catch (botError) {
                Logger.debug('No se pudieron obtener métricas adicionales del bot');
            }

            const estadoMsg = `🛡️ *ESTADO DE GUARDIAN BOT*

🤖 *Nombre:* ${Config.bot.nombre}
⚡ *Prefijo:* ${Config.bot.prefix}
📦 *Versión:* ${Config.bot.version}

${ownersInfo}

📊 *Estadísticas:*
⏰ *Encendido:* ${uptimeFormateado}
📨 *Mensajes:* ${mensajesProcesados}
🔧 *Comandos:* ${comandosEjecutados}
📦 *Plugins:* ${pluginsCargados}
🛠️ *Total Comandos:* ${comandosTotales}

💾 *Memoria:*
• RSS: ${memoriaUsada}MB
• Heap: ${memoriaHeap}MB

🛡️ *Protegiendo tus grupos 24/7*`;

            await sock.sendMessage(jid, { text: estadoMsg }, { quoted: message });
            Logger.info(`✅ Estado enviado a ${jid}`);

        } catch (error) {
            Logger.error('Error en comando estado:', error);

            // Enviar mensaje de error simple
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al obtener el estado del bot.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje de error:', sendError);
            }
        }
    }
};