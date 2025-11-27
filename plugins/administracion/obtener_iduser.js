const Logger = require('../../utils/logger');

module.exports = {
    command: ['id', 'identificar'],
        description: 'Obtener ID del grupo o usuario',
        isOwner: false,
        isGroup: true,      // ✅ Grupos
        isPrivate: true,    // ✅ Privado también

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Verificar si hay mención
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Menciona al usuario*\nEj: *iduser @usuario' 
                }, { quoted: message });
            }

            const mentionedUsers = message.message.extendedTextMessage.contextInfo.mentionedJid;
            let infoMsg = '👥 *INFORMACIÓN DE USUARIOS*\n\n';

            mentionedUsers.forEach((userJid, index) => {
                const userNum = userJid.split('@')[0];
                infoMsg += `${index + 1}. @${userNum}\n🆔 ID: ${userJid}\n\n`;
            });

            await sock.sendMessage(jid, { 
                text: infoMsg,
                mentions: mentionedUsers
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en comando iduser:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener IDs' 
            }, { quoted: message });
        }
    }
};