const Logger = require('../../utils/logger');

module.exports = {
    command: ['cerrar', 'close'],
    description: 'Cerrar el grupo (Solo Admins)',
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

            // Cerrar el grupo
            await sock.groupSettingUpdate(jid, 'announcement');

            await sock.sendMessage(jid, { 
                text: '🔒 *Grupo cerrado*\n\nSolo administradores pueden enviar mensajes.' 
            }, { quoted: message });

            Logger.info(`✅ Grupo cerrado en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando cerrar:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al cerrar el grupo.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};