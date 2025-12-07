const Logger = require('../../utils/logger');

module.exports = {
    command: ['promote', 'promover', 'admin'],
    description: 'Otorgar permisos de administrador a un miembro (Solo Admins)',
    isGroup: true,
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
                        text: '❌ Uso: .promote @user o .promote 5049900...' 
                    }, { quoted: message });
                }
                userJid = `${numero}@s.whatsapp.net`;
            }
            
            if (userJid) {
                await promoverUsuario(sock, jid, userJid, message);
            } else {
                // 3. MENSAJE DE USO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Debes mencionar o usar .promote [número].' 
                }, { quoted: message });
            }

        } catch (error) {
            Logger.error('Error en comando promote:', error);
            
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

// Función auxiliar para promover usuario
async function promoverUsuario(sock, groupJid, userJid, originalMessage) {
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

        // Verificar si ya es administrador
        if (['admin', 'superadmin'].includes(userInGroup.admin)) {
            // 6. YA ES ADMIN REDUCIDO Y ETIQUETADO
            return await sock.sendMessage(groupJid, { 
                text: `✅ @${userJid.split('@')[0]} ya es Admin.`, 
                mentions: [userJid] // Etiquetar al usuario
            }, { quoted: originalMessage });
        }

        // Promover al usuario
        await sock.groupParticipantsUpdate(
            groupJid,
            [userJid],
            "promote"
        );
        
        // 7. CONFIRMACIÓN EXITOSA REDUCIDA Y ETIQUETADA
        await sock.sendMessage(groupJid, { 
            text: `⬆️ @${userJid.split('@')[0]} promovido a Admin.`, 
            mentions: [userJid] // Etiquetar al usuario
        }, { quoted: originalMessage });

        Logger.info(`✅ Usuario ${userJid} promovido a admin en grupo ${groupJid}`);

    } catch (error) {
        Logger.error('Error en promoverUsuario:', error);
        
        let mensajeError = '❌ Error de ejecución.';
        
        if (error.message.includes('not authorized')) {
            // 8. BOT SIN PERMISOS REDUCIDO
            mensajeError = '❌ No tengo permisos para promover.';
        } else if (error.message.includes('not in group')) {
            // 9. USUARIO NO EN GRUPO (FALLBACK) REDUCIDO
            mensajeError = '❌ El usuario no está en el grupo.';
        }

        await sock.sendMessage(groupJid, { 
            text: mensajeError 
        }, { quoted: originalMessage });
    }
}