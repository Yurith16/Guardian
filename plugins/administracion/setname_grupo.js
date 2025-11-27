const Logger = require('../../utils/logger');

module.exports = {
    command: ['setname', 'cambiarnombre'],
    description: 'Cambiar nombre del grupo (Solo Admins)',
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

            // Verificar si se proporcionó nuevo nombre
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .setname <nuevo nombre>\n*Ejemplo:* .setname Mi Grupo Oficial' 
                }, { quoted: message });
            }

            const nuevoNombre = args.join(' ');
            
            // Validar longitud del nombre
            if (nuevoNombre.length > 25) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El nombre no puede tener más de 25 caracteres.' 
                }, { quoted: message });
            }

            // Cambiar nombre del grupo
            await sock.groupUpdateSubject(jid, nuevoNombre);

            await sock.sendMessage(jid, { 
                text: `✅ *Nombre cambiado*\n\n📝 ${nuevoNombre}` 
            }, { quoted: message });

            Logger.info(`✅ Nombre del grupo cambiado a "${nuevoNombre}" por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setname:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al cambiar el nombre del grupo.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};