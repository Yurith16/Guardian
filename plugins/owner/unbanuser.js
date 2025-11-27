const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['unban', 'desbloquear'],
    description: 'Desbloquear usuario globalmente del bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS
            if (!ManejadorPropietarios.esOwner(sender)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .unban por: ${sender}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            let userJid;

            // Verificar si es respuesta a un mensaje
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
            if (quotedMessage?.participant) {
                // Usar el usuario del mensaje citado
                userJid = quotedMessage.participant;
            } 
            // Verificar si se mencionó a alguien
            else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } 
            // Verificar si se proporcionó número
            else if (args.length > 0) {
                const numero = args[0].trim();
                if (!/^\d{8,15}$/.test(numero)) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ *Formato inválido.*\nUsa: .unban @usuario\nO: .unban 50499001122\nO: Responde .unban a un mensaje' 
                    }, { quoted: message });
                }
                userJid = `${numero}@s.whatsapp.net`;
            } else {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Debes mencionar, responder o proporcionar un número.*\n\n*Ejemplos:*\n.unban @usuario\n.unban 50499001122\nResponde .unban a un mensaje' 
                }, { quoted: message });
            }

            // Cargar lista negra
            const blacklistPath = path.join(__dirname, '../../config/blacklist.json');
            const blacklistData = JSON.parse(await fs.readFile(blacklistPath, 'utf8'));

            // Buscar el usuario en la lista negra (compara con cualquier formato)
            const usuarioBaneado = blacklistData.bannedUsers.find(bannedJid => {
                // Comparar números sin el @
                const bannedNumber = bannedJid.split('@')[0];
                const userNumber = userJid.split('@')[0];
                return bannedNumber === userNumber;
            });

            if (!usuarioBaneado) {
                return await sock.sendMessage(jid, { 
                    text: '✅ El usuario no está baneado.' 
                }, { quoted: message });
            }

            // Remover de lista negra (elimina cualquier formato que tenga)
            blacklistData.bannedUsers = blacklistData.bannedUsers.filter(bannedJid => {
                const bannedNumber = bannedJid.split('@')[0];
                const userNumber = userJid.split('@')[0];
                return bannedNumber !== userNumber;
            });

            await fs.writeFile(blacklistPath, JSON.stringify(blacklistData, null, 2));

            const userNumber = userJid.split('@')[0];

            await sock.sendMessage(jid, { 
                text: `✅ *Usuario desbaneado*\n📱 ${userNumber}\n\n✅ Ahora puede usar el bot nuevamente.` 
            }, { quoted: message });

            Logger.info(`✅ Usuario ${userJid} desbaneado por ${sender}`);

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