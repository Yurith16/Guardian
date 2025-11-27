const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['ban', 'bloquear'],
    description: 'Bloquear usuario globalmente del bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const remitente = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN MEJORADA DE PERMISOS
            if (!ManejadorPropietarios.esOwner(remitente)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .ban por: ${remitente}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            // Verificar si se proporcionó usuario
            if (args.length === 0 && !message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso Correcto:*\n.ban @usuario\n.ban 50499001122\n.ban lista - Ver usuarios baneados' 
                }, { quoted: message });
            }

            // 📋 MOSTRAR LISTA DE BANEADOS
            if (args[0]?.toLowerCase() === 'lista') {
                return await this.mostrarListaBaneados(sock, message);
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

            // 🚫 EVITAR QUE OWNERS SE BANEEN A SÍ MISMOS
            if (ManejadorPropietarios.esOwner(userJid)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *No puedes banear a otro propietario del bot.*' 
                }, { quoted: message });
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
                text: `✅ *USUARIO BANEADO*\n\n📱 *Número:* ${userNumber}\n⏰ *Fecha:* ${new Date().toLocaleString()}\n🚫 *Estado:* Bloqueado globalmente\n\nEl usuario ya no podrá usar comandos del bot en ningún grupo.` 
            }, { quoted: message });

            Logger.info(`✅ Usuario ${userJid} baneado por ${remitente}`);

        } catch (error) {
            Logger.error('Error en comando ban:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ *Error al banear al usuario.*\nVerifica los logs para más información.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    },

    // 📋 MÉTODO PARA MOSTRAR LISTA DE BANEADOS
    async mostrarListaBaneados(sock, message) {
        try {
            const blacklistPath = path.join(__dirname, '../../config/blacklist.json');
            const blacklistData = JSON.parse(await fs.readFile(blacklistPath, 'utf8'));

            const usuariosBaneados = blacklistData.bannedUsers || [];

            if (usuariosBaneados.length === 0) {
                return await sock.sendMessage(message.key.remoteJid, {
                    text: '📋 *LISTA DE USUARIOS BANEADOS*\n\n✅ No hay usuarios baneados actualmente.'
                }, { quoted: message });
            }

            let listaTexto = '📋 *LISTA DE USUARIOS BANEADOS*\n\n';

            usuariosBaneados.forEach((userJid, index) => {
                const numero = userJid.split('@')[0];
                listaTexto += `${index + 1}. 📱 ${numero}\n`;
            });

            listaTexto += `\nTotal: ${usuariosBaneados.length} usuario(s) baneado(s)`;

            await sock.sendMessage(message.key.remoteJid, {
                text: listaTexto
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error mostrando lista baneados:', error);
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ Error al cargar la lista de usuarios baneados.'
            }, { quoted: message });
        }
    }
};