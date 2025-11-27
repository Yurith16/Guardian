const Logger = require('../../utils/logger');

module.exports = {
    command: ['info', 'usuario'],
        description: 'Información de usuario',
        isOwner: false,
        isGroup: true,      // ✅ Grupos
        isPrivate: true, 

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            let targetJid;

            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                targetJid = message.key.participant || message.key.remoteJid;
            }

            const userNum = targetJid.split('@')[0];

            await sock.sendMessage(jid, { 
                text: `👤 *INFORMACIÓN*\n\n📱 Número: ${userNum}\n🆔 ID: ${targetJid}`,
                mentions: [targetJid]
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en info:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener info' 
            }, { quoted: message });
        }
    }
};