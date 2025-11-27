const Logger = require('../../utils/logger');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['stop', 'detener', 'parar', 'apagar', 'shutdown'],
    description: 'Apagar el bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS
            if (!ManejadorPropietarios.esOwner(sender)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .stop por: ${sender}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            // Enviar mensaje de confirmación
            await sock.sendMessage(jid, { 
                text: '🛑 *Apagando Guardian Bot...*\n\n¡Hasta pronto! 👋' 
            }, { quoted: message });

            Logger.info(`🛑 Apagado solicitado por ${sender}`);

            // Cerrar conexión limpiamente
            if (sock && sock.ws) {
                try {
                    await sock.ws.close();
                } catch (closeError) {
                    Logger.debug('Error cerrando conexión:', closeError);
                }
            }

            // Salir del proceso después de un breve delay
            setTimeout(() => {
                Logger.info('✅ Bot apagado correctamente');
                process.exit(0);
            }, 2000);

        } catch (error) {
            Logger.error('Error en comando stop:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al apagar el bot.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};