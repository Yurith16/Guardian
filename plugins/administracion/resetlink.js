const Logger = require('../../utils/logger');

module.exports = {
    command: ['revoke', 'resetlink', 'nuevolink'],
    description: 'Invalidar enlace actual y generar uno nuevo (Solo Admins)',
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
                return await sock.sendMessage(jid, { 
                    text: '❌ Este comando solo es para administradores.' 
                }, { quoted: message });
            }

            // Invalidar enlace actual y generar nuevo
            const newGroupCode = await sock.groupRevokeInvite(jid);
            const newGroupLink = `https://chat.whatsapp.com/${newGroupCode}`;

            const groupName = metadata.subject || 'Grupo sin nombre';

            const mensaje = `🔄 *ENLACE ACTUALIZADO*

📌 *Grupo:* ${groupName}

🔗 *Nuevo enlace:*
${newGroupLink}

*⚠️ El enlace anterior fue invalidado*`;

            await sock.sendMessage(jid, { 
                text: mensaje 
            }, { quoted: message });

            Logger.info(`✅ Enlace revocado y nuevo generado para ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando revoke:', error);
            
            let mensajeError = '❌ No se pudo actualizar el enlace.';
            
            if (error.message.includes('not authorized')) {
                mensajeError = '❌ No tengo permisos de administrador.';
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