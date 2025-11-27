const Logger = require('../../utils/logger');

module.exports = {
    command: ['setdesc', 'descripcion', 'setdescription'],
    description: 'Cambiar descripción del grupo (Solo Admins)',
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

            // Verificar si se proporcionó descripción
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .setdesc <nueva descripción>\n*Ejemplo:* .setdesc Grupo oficial de la comunidad' 
                }, { quoted: message });
            }

            const nuevaDesc = args.join(' ');
            
            // Validar longitud de la descripción
            if (nuevaDesc.length > 500) {
                return await sock.sendMessage(jid, { 
                    text: '❌ La descripción no puede tener más de 500 caracteres.' 
                }, { quoted: message });
            }

            // Cambiar descripción del grupo
            await sock.groupUpdateDescription(jid, nuevaDesc);

            await sock.sendMessage(jid, { 
                text: `✅ *Descripción actualizada*\n\n📄 ${nuevaDesc}` 
            }, { quoted: message });

            Logger.info(`✅ Descripción del grupo cambiada por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setdesc:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al cambiar la descripción del grupo.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};