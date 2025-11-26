const Logger = require('../../utils/logger');

module.exports = {
    command: ['kick', 'expulsar'],
    description: 'Expulsar usuario del grupo',
    isOwner: true,
    isAdmin: true,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Verificar si hay mención
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Menciona al usuario*\nEj: .kick @usuario' 
                }, { quoted: message });
            }

            const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];

            // Expulsar usuario
            await sock.groupParticipantsUpdate(jid, [userJid], 'remove');

            await sock.sendMessage(jid, { 
                text: '👢 *Usuario expulsado*' 
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en kick:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al expulsar' 
            }, { quoted: message });
        }
    }
};