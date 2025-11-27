const Logger = require('../../utils/logger');

module.exports = {
    command: ['iduser', 'idusuario'],
        description: 'Obtener ID de usuario mencionado',
        isOwner: false,
        isAdmin: false,
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            let infoMsg = '';

            // Si es un grupo
            if (jid.endsWith('@g.us')) {
                const groupInfo = await sock.groupMetadata(jid);

                infoMsg = `📊 *INFORMACIÓN DEL GRUPO*\n\n` +
                         `🏷️ *Nombre:* ${groupInfo.subject}\n` +
                         `🆔 *ID Grupo:* ${groupInfo.id}\n` +
                         `👥 *Miembros:* ${groupInfo.participants.length}\n\n` +
                         `💡 *Tu ID:* ${message.key.participant || 'No disponible en grupos'}`;

            } else {
                // Si es chat privado
                const userJid = message.key.remoteJid;
                const userNum = userJid.split('@')[0];

                infoMsg = `👤 *INFORMACIÓN PERSONAL*\n\n` +
                         `📱 *Tu número:* ${userNum}\n` +
                         `🆔 *Tu ID:* ${userJid}`;
            }

            await sock.sendMessage(jid, { text: infoMsg }, { quoted: message });
            Logger.info(`✅ ID enviado a ${jid}`);

        } catch (error) {
            Logger.error('Error en comando id:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener la información' 
            }, { quoted: message });
        }
    }
};