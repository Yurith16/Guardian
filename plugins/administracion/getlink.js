const Logger = require('../../utils/logger');

module.exports = {
    command: ['link', 'enlace', 'getlink', 'invitelink'],
    description: 'Generar enlace de invitación del grupo (Solo Admins)',
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
                // MENSAJE DE PERMISO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo Admins.' 
                }, { quoted: message });
            }

            // OBTENER JID DEL BOT DE FORMA CORRECTA
            let botJid;
            if (sock.user && sock.user.id) {
                botJid = sock.user.id;
            } else {
                // Intentar obtener de otra forma
                try {
                    const me = await sock.user;
                    botJid = me?.id;
                } catch (e) {
                    botJid = null;
                }
            }

            if (!botJid) {
                // Si no podemos obtener el JID del bot, intentar generar el enlace directamente
                Logger.warn('No se pudo obtener JID del bot, intentando generar enlace directamente...');
                return await generarEnlaceDirecto(sock, jid, message, metadata);
            }

            // Verificar si el bot es administrador
            const botParticipant = metadata.participants.find(p => p.id === botJid);
            
            if (!botParticipant) {
                Logger.warn(`Bot JID: ${botJid} no encontrado en participantes. Intentando generar enlace...`);
                return await generarEnlaceDirecto(sock, jid, message, metadata);
            }

            if (!['admin', 'superadmin'].includes(botParticipant.admin)) {
                // MENSAJE DE PERMISO DEL BOT REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Necesito ser Admin para generar el enlace.' 
                }, { quoted: message });
            }

            // Generar el enlace exitosamente
            await generarEnlace(sock, jid, message, metadata);

        } catch (error) {
            Logger.error('Error en comando link:', error);
            
            let mensajeError = '❌ Error al generar el enlace.';
            
            if (error.message.includes('not authorized') || error.message.includes('401')) {
                mensajeError = '❌ No tengo permisos de Admin.';
            } else if (error.message.includes('group is full')) {
                mensajeError = '❌ Grupo lleno.';
            } else if (error.message.includes('no internet')) {
                mensajeError = '❌ Error de conexión.';
            } else if (error.message.includes('recently')) {
                mensajeError = '❌ Enlace generado reciente. Espera.';
            }

            try {
                await sock.sendMessage(jid, { 
                    text: mensajeError 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};

// Función para generar enlace directamente (sin verificar permisos del bot)
async function generarEnlaceDirecto(sock, jid, originalMessage, metadata) {
    try {
        Logger.info('Intentando generar enlace sin verificación de permisos...');
        const groupCode = await sock.groupInviteCode(jid);
        const groupLink = `https://chat.whatsapp.com/${groupCode}`;

        const groupName = metadata.subject || 'Grupo sin nombre';
        const participantsCount = metadata.participants.length;

        // MENSAJE DE ÉXITO DIRECTO REDUCIDO
        const mensaje = `🔗 *ENLACE DE INVITACIÓN*

*Grupo:* ${groupName} (${participantsCount} miembros)

${groupLink}`;

        await sock.sendMessage(jid, { 
            text: mensaje 
        }, { quoted: originalMessage });

        Logger.info(`✅ Enlace generado exitosamente para ${jid}`);

    } catch (error) {
        Logger.error('Error al generar enlace directamente:', error);
        
        if (error.message.includes('not authorized') || error.message.includes('401')) {
            await sock.sendMessage(jid, { 
                text: '❌ No tengo permisos de Admin.' 
            }, { quoted: originalMessage });
        } else {
            await sock.sendMessage(jid, { 
                text: '❌ Error al generar el enlace.' 
            }, { quoted: originalMessage });
        }
    }
}

// Función para generar enlace cuando el bot es admin
async function generarEnlace(sock, jid, originalMessage, metadata) {
    try {
        const groupCode = await sock.groupInviteCode(jid);
        const groupLink = `https://chat.whatsapp.com/${groupCode}`;

        const groupName = metadata.subject || 'Grupo sin nombre';
        const participantsCount = metadata.participants.length;

        // MENSAJE DE ÉXITO ADMIN REDUCIDO
        const mensaje = `🔗 *ENLACE DE INVITACIÓN*

*Grupo:* ${groupName} (${participantsCount} miembros)

${groupLink}`;

        await sock.sendMessage(jid, { 
            text: mensaje 
        }, { quoted: originalMessage });

        Logger.info(`✅ Enlace generado para el grupo ${jid}`);

    } catch (error) {
        throw error; // Propagar el error para manejarlo en la función principal
    }
}