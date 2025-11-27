const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    command: ['ban', 'bloquear'],
    description: 'Bloquear usuario globalmente del bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        
        try {
            // Verificar si se proporcionó usuario
            if (args.length === 0 && !message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .ban @usuario\nO: .ban 50499001122' 
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
                        text: '❌ *Formato inválido.*\nUsa: .ban @usuario\nO: .ban 50499001122' 
                    }, { quoted: message });
                }
                userJid = `${numero}@s.whatsapp.net`;
            }

            // Cargar lista negra
            const blacklistPath = path.join(__dirname, '../../config/blacklist.json');
            const blacklistData = JSON.parse(await fs.readFile(blacklistPath, 'utf8'));
            
            // Verificar si ya está baneado
            if (blacklistData.bannedUsers.includes(userJid)) {
                return await sock.sendMessage(jid, { 
                    text: '✅ El usuario ya está baneado.' 
                }, { quoted: message });
            }

            // Agregar a lista negra
            blacklistData.bannedUsers.push(userJid);
            await fs.writeFile(blacklistPath, JSON.stringify(blacklistData, null, 2));

            const userNumber = userJid.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ *Usuario baneado*\n📱 ${userNumber}\n\n❌ Ya no podrá usar el bot en ningún grupo.` 
            }, { quoted: message });

            Logger.info(`✅ Usuario ${userJid} baneado por ${jid}`);

        } catch (error) {
            Logger.error('Error en comando ban:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al banear al usuario.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};