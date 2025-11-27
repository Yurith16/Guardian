const Logger = require('../../utils/logger');
const { spawn } = require('child_process');
const path = require('path');

module.exports = {
    command: ['reiniciar', 'restart'],
    description: 'Reiniciar el bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            await sock.sendMessage(jid, { 
                text: '🔄 *Reiniciando Guardian...*\n\nEn breve estará activo nuevamente.' 
            }, { quoted: message });

            Logger.info(`🔄 Reinicio solicitado por ${jid}`);

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