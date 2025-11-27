const Logger = require('../../utils/logger');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['join', 'unete'],
    description: 'Unir el bot a un grupo usando enlace (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS
            if (!ManejadorPropietarios.esOwner(sender)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .join por: ${sender}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            // Verificar si se proporcionó enlace
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .join <enlace>\n*Ejemplo:* .join https://chat.whatsapp.com/ABC123...' 
                }, { quoted: message });
            }

            let enlace = args[0].trim();

            // Asegurar que el enlace tenga el formato correcto
            if (!enlace.includes('chat.whatsapp.com/')) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Enlace inválido.*\nDebe ser un enlace de WhatsApp.\n*Ejemplo:* https://chat.whatsapp.com/ABC123...' 
                }, { quoted: message });
            }

            // Limpiar el enlace - quitar parámetros y obtener solo el código
            let codigoGrupo;

            if (enlace.includes('?')) {
                // Si tiene parámetros como ?mode=hqrt1
                const baseUrl = enlace.split('?')[0];
                codigoGrupo = baseUrl.split('/').pop();
            } else {
                // Enlace normal
                codigoGrupo = enlace.split('/').pop();
            }

            // Validar que el código no esté vacío
            if (!codigoGrupo || codigoGrupo.length < 5) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Enlace inválido.*\nEl código del grupo no es válido.' 
                }, { quoted: message });
            }

            Logger.info(`🔄 Intentando unirse al grupo con código: ${codigoGrupo}`);

            // Unir el bot al grupo
            await sock.groupAcceptInvite(codigoGrupo);

            await sock.sendMessage(jid, { 
                text: '✅ *Bot unido al grupo exitosamente*' 
            }, { quoted: message });

            Logger.info(`✅ Bot unido a grupo por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando join:', error);

            let mensajeError = '❌ Error al unirse al grupo.';

            if (error.message.includes('invite') || error.message.includes('invalid')) {
                mensajeError = '❌ Enlace inválido o expirado.';
            } else if (error.message.includes('already') || error.message.includes('participant')) {
                mensajeError = '✅ El bot ya está en ese grupo.';
            } else if (error.message.includes('full')) {
                mensajeError = '❌ El grupo está lleno.';
            } else if (error.message.includes('banned')) {
                mensajeError = '❌ El bot fue baneado de ese grupo.';
            }

            Logger.error(`Detalles del error: ${error.message}`);

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