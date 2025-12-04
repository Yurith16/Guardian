const Logger = require('../../utils/logger');

module.exports = {
    command: ['myid', 'aidi0', 'miid'],
    description: 'Obtener tu ID de usuario',
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            const senderNumber = sender.split('@')[0];

            await sock.sendMessage(jid, { 
                text: `👤 *TU INFORMACIÓN*\n\n📱 *Número:* ${senderNumber}\n🆔 *ID Completo:* ${sender}\n\n💡 *Para usar en comandos owner:*\nCopia solo el número: ${senderNumber}` 
            }, { quoted: message });

            Logger.info(`✅ ID enviado a ${sender}`);

        } catch (error) {
            Logger.error('Error en comando myid:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al obtener tu ID.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};