const Logger = require('../../utils/logger');

module.exports = {
    command: ['ban', 'banear'],
        description: 'Banear usuario del grupo',
        isOwner: false,
        isAdmin: true,
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false, 

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Menciona al usuario*\nEj: .ban @usuario' 
                }, { quoted: message });
            }

            const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];

            // Banear usuario
            await sock.groupParticipantsUpdate(jid, [userJid], 'remove');

            await sock.sendMessage(jid, { 
                text: '🚫 *Usuario baneado*' 
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en ban:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al banear' 
            }, { quoted: message });
        }
    }
};