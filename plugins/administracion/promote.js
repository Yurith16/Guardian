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
                return await sock.sendMessage(jid, { 
                    text: '❌ Este comando solo es para administradores.' 
                }, { quoted: message });
            }

            // Verificar si se mencionó a alguien o se proporcionó número
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                // Usuario mencionado
                const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                await promoverUsuario(sock, jid, userJid, message);
                
            } else if (args.length > 0) {
                // Número proporcionado
                const numero = args[0].trim();
                if (!/^\d{8,15}$/.test(numero)) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ *Formato inválido.*\nUsa: .promote @usuario\nO: .promote 50499001122' 
                    }, { quoted: message });
                }
                const userJid = `${numero}@s.whatsapp.net`;
                await promoverUsuario(sock, jid, userJid, message);
                
            } else {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Debes mencionar a un usuario o proporcionar un número.*\n\n*Ejemplos:*\n.promote @usuario\n.promote 50499001122' 
                }, { quoted: message });
            }

        } catch (error) {
            Logger.error('Error en comando promote:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al promover al usuario.' 
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
            return await sock.sendMessage(groupJid, { 
                text: '❌ El usuario no está en el grupo.' 
            }, { quoted: originalMessage });
        }

        // Verificar si ya es administrador
        if (['admin', 'superadmin'].includes(userInGroup.admin)) {
            return await sock.sendMessage(groupJid, { 
                text: '✅ El usuario ya es administrador.' 
            }, { quoted: originalMessage });
        }

        // Promover al usuario
        await sock.groupParticipantsUpdate(
            groupJid,
            [userJid],
            "promote"
        );

        // Obtener información del usuario para el mensaje
        const userNumber = userJid.split('@')[0];
        
        await sock.sendMessage(groupJid, { 
            text: `✅ *Usuario promovido a administrador*\n📱 ${userNumber}` 
        }, { quoted: originalMessage });

        Logger.info(`✅ Usuario ${userJid} promovido a admin en grupo ${groupJid}`);

    } catch (error) {
        Logger.error('Error en promoverUsuario:', error);
        
        let mensajeError = '❌ No se pudo promover al usuario.';
        
        if (error.message.includes('not authorized')) {
            mensajeError = '❌ No tengo permisos para promover administradores.';
        } else if (error.message.includes('not in group')) {
            mensajeError = '❌ El usuario no está en el grupo.';
        }

        await sock.sendMessage(groupJid, { 
            text: mensajeError 
        }, { quoted: originalMessage });
    }
}