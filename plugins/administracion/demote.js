const Logger = require('../../utils/logger');

module.exports = {
    command: ['demote', 'degradar', 'quitaradmin'],
    description: 'Quitar permisos de administrador a un miembro (Solo Admins)',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        
        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);
            
            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                // 1. MENSAJE DE PERMISO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo Admins.' 
                }, { quoted: message });
            }

            let userJid = null;

            // Buscar usuario mencionado
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                
            } else if (args.length > 0) {
                // Buscar número proporcionado
                const numero = args[0].trim().replace(/\D/g, ''); // Limpiar el número
                if (numero.length < 8) {
                    // 2. MENSAJE DE FORMATO REDUCIDO
                    return await sock.sendMessage(jid, { 
                        text: '❌ Uso: .demote @user o .demote 5049900...' 
                    }, { quoted: message });
                }
                userJid = `${numero}@s.whatsapp.net`;
            } 
            
            if (userJid) {
                await degradarUsuario(sock, jid, userJid, message);
            } else {
                // 3. MENSAJE DE USO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Debes mencionar o usar .demote [número].' 
                }, { quoted: message });
            }

        } catch (error) {
            Logger.error('Error en comando demote:', error);
            
            try {
                // 4. MENSAJE DE ERROR GENERAL REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Error al ejecutar el comando.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};

// Función auxiliar para degradar usuario
async function degradarUsuario(sock, groupJid, userJid, originalMessage) {
    try {
        // Verificar si el usuario está en el grupo
        const metadata = await sock.groupMetadata(groupJid);
        const userInGroup = metadata.participants.find(p => p.id === userJid);
        
        if (!userInGroup) {
            // 5. USUARIO NO EN GRUPO REDUCIDO
            return await sock.sendMessage(groupJid, { 
                text: `❌ Usuario no encontrado.` 
            }, { quoted: originalMessage });
        }

        // Verificar si ya es usuario normal
        if (!['admin', 'superadmin'].includes(userInGroup.admin)) {
            // 6. NO ES ADMIN REDUCIDO
            return await sock.sendMessage(groupJid, { 
                text: `❌ @${userJid.split('@')[0]} ya es usuario normal.`,
                mentions: [userJid] // Etiquetar al usuario
            }, { quoted: originalMessage });
        }

        // No permitir degradarse a sí mismo (al bot)
        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (userJid === botJid) {
            // 7. NO AUTODEGRADARSE REDUCIDO
            return await sock.sendMessage(groupJid, { 
                text: '❌ No puedo degradarme.' 
            }, { quoted: originalMessage });
        }

        // Degradar al usuario
        await sock.groupParticipantsUpdate(
            groupJid,
            [userJid],
            "demote"
        );

        // 8. CONFIRMACIÓN EXITOSA REDUCIDA Y ETIQUETADA
        await sock.sendMessage(groupJid, { 
            text: `⬇️ @${userJid.split('@')[0]} degradado a miembro.`, 
            mentions: [userJid] // Etiquetar al usuario
        }, { quoted: originalMessage });

        Logger.info(`✅ Usuario ${userJid} degradado de admin en grupo ${groupJid}`);

    } catch (error) {
        Logger.error('Error en degradarUsuario:', error);
        
        let mensajeError = '❌ Error de ejecución.';
        
        if (error.message.includes('not authorized')) {
            // 9. BOT SIN PERMISOS REDUCIDO
            mensajeError = '❌ No tengo permisos para degradar.';
        } else if (error.message.includes('not in group')) {
            // 10. USUARIO NO EN GRUPO (FALLBACK) REDUCIDO
            mensajeError = '❌ El usuario no está en el grupo.';
        }
        
        // El error no incluye el JID, pero se usa la función de enviar con el mensaje
        await sock.sendMessage(groupJid, { 
            text: mensajeError 
        }, { quoted: originalMessage });
    }
}