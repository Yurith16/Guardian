const Logger = require('../../utils/logger');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['reiniciar', 'restart'],
    description: 'Reiniciar el bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS
            if (!ManejadorPropietarios.esOwner(sender)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .reiniciar por: ${sender}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            await sock.sendMessage(jid, { 
                text: '🔄 *Reiniciando Guardian...*\n\nEn breve estará activo nuevamente.' 
            }, { quoted: message });

            Logger.info(`🔄 Reinicio solicitado por ${sender}`);

            // Cerrar limpiamente
            setTimeout(() => {
                process.exit(1); // Código de salida 1 para reinicio
            }, 1000);

        } catch (error) {
            Logger.error('Error en comando reiniciar:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al intentar reiniciar.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};