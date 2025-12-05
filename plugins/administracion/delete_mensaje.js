const Logger = require('../../utils/logger');

module.exports = {
    command: ['delete', 'del', 'eliminar'],
    description: 'Eliminar mensaje respondido (solo admins)',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Verificar si el mensaje es una respuesta
            if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                await sock.sendMessage(jid, { 
                    text: '❌ *Responde a un mensaje para eliminarlo*' 
                }, { quoted: message });
                return;
            }

            const quotedMessage = message.message.extendedTextMessage.contextInfo;

            // Eliminar el mensaje respondido
            await sock.sendMessage(jid, {
                delete: {
                    id: quotedMessage.stanzaId,
                    participant: quotedMessage.participant,
                    remoteJid: jid,
                    fromMe: quotedMessage.participant === sock.user.id
                }
            });

            Logger.info(`✅ Mensaje eliminado por admin en ${jid}`);

        } catch (error) {
            Logger.error('💥 ERROR en comando del:', error);

            await sock.sendMessage(jid, { 
                text: '❌ *Error al eliminar el mensaje*\n\nAsegúrate de que:\n• El bot es administrador\n• El mensaje no es muy antiguo\n• Tienes permisos de administrador' 
            }, { quoted: message });
        }
    }
};