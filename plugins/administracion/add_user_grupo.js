const Logger = require('../../utils/logger');

module.exports = {
    command: ['add', 'agregar'],
    description: 'Agregar miembro al grupo (Solo Admins)',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        
        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);
            
            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Este comando solo es para administradores.' 
                }, { quoted: message });
            }

            // Verificar si hay número proporcionado
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso correcto:* .add <número>\n*Ejemplo:* .add 50499001122' 
                }, { quoted: message });
            }

            const numero = args[0].trim();
            
            // Validar formato del número
            if (!/^\d{8,15}$/.test(numero)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Formato inválido.*\nEl número debe incluir código de país.\n*Ejemplo:* 50499001122' 
                }, { quoted: message });
            }

            // Formatear número
            const numeroFormateado = `${numero}@s.whatsapp.net`;

            Logger.info(`🔄 Intentando agregar ${numero} al grupo ${jid}`);

            // Agregar usuario
            await sock.groupParticipantsUpdate(
                jid,
                [numeroFormateado],
                "add"
            );

            // Mensaje de éxito
            await sock.sendMessage(jid, { 
                text: `✅ *Usuario agregado correctamente*\n📱 ${numero}` 
            }, { quoted: message });

            Logger.info(`✅ Usuario ${numero} agregado al grupo por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando add:', error);
            
            let mensajeError = '❌ No se pudo agregar al usuario.';
            
            if (error.message.includes('not authorized')) {
                mensajeError = '❌ No tengo permisos para agregar miembros.';
            } else if (error.message.includes('requested participant')) {
                mensajeError = '❌ Número inválido o no existe en WhatsApp.';
            } else if (error.message.includes('group is full')) {
                mensajeError = '❌ El grupo está lleno.';
            } else if (error.message.includes('already in group')) {
                mensajeError = '❌ El usuario ya está en el grupo.';
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