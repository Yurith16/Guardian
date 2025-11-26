const Logger = require('../../utils/logger');

module.exports = {
    command: ['warn', 'advertir'],
    description: 'Advertir a usuario',
    isOwner: false,
    isAdmin: true,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Menciona al usuario*\nEj: .warn @usuario' 
                }, { quoted: message });
            }

            const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            const razon = args.slice(1).join(' ') || 'Sin razón especificada';

            await sock.sendMessage(jid, { 
                text: `⚠️ *Advertencia*\n👤 Usuario: @${userJid.split('@')[0]}\n📝 Razón: ${razon}`,
                mentions: [userJid]
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en warn:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al advertir' 
            }, { quoted: message });
        }
    }
};