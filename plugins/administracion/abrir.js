const Logger = require('../../utils/logger');

module.exports = {
    command: ['abrir', 'open'],
    description: 'Abrir el grupo (Solo Admins)',
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

            // Abrir el grupo
            await sock.groupSettingUpdate(jid, 'not_announcement');

            await sock.sendMessage(jid, { 
                text: '🔓 *Grupo abierto*\n\nAhora todos pueden enviar mensajes.' 
            }, { quoted: message });

            Logger.info(`✅ Grupo abierto en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando abrir:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al abrir el grupo.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};