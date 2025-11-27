const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    command: ['unban', 'desbloquear'],
    description: 'Desbloquear usuario globalmente del bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        
        try {
            // Verificar si se proporcionó usuario
            if (args.length === 0 && !message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .unban @usuario\nO: .unban 50499001122' 
                }, { quoted: message });
            }

            let userJid;

            // Obtener JID del usuario
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                const numero = args[0].trim();
                if (!/^\d{8,15}$/.test(numero)) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ *Formato inválido.*\nUsa: .unban @usuario\nO: .unban 50499001122' 
                    }, { quoted: message });
                }
                userJid = `${numero}@s.whatsapp.net`;
            }

            // Cargar lista negra
            const blacklistPath = path.join(__dirname, '../../config/blacklist.json');
            const blacklistData = JSON.parse(await fs.readFile(blacklistPath, 'utf8'));
            
            // Verificar si está baneado
            if (!blacklistData.bannedUsers.includes(userJid)) {
                return await sock.sendMessage(jid, { 
                    text: '✅ El usuario no está baneado.' 
                }, { quoted: message });
            }

            // Remover de lista negra
            blacklistData.bannedUsers = blacklistData.bannedUsers.filter(jid => jid !== userJid);
            await fs.writeFile(blacklistPath, JSON.stringify(blacklistData, null, 2));

            const userNumber = userJid.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ *Usuario desbaneado*\n📱 ${userNumber}\n\n✅ Ahora puede usar el bot nuevamente.` 
            }, { quoted: message });

            Logger.info(`✅ Usuario ${userJid} desbaneado por ${jid}`);

        } catch (error) {
            Logger.error('Error en comando unban:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al desbanear al usuario.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};