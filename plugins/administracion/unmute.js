const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['unmute', 'desilenciar'],
    description: 'Quitar silencio a usuario',
    isGroup: true,
    isPrivate: false,
    isAdmin: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);

            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo administradores pueden usar este comando.' 
                }, { quoted: message });
            }

            // Verificar mención
            const mencionJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            
            if (!mencionJid || mencionJid.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Menciona al usuario.\nEj: .unmute @usuario' 
                }, { quoted: message });
            }

            const userJid = mencionJid[0];

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            
            // Verificar si está silenciado
            const silenciadoInfo = await gestorGrupos.verificarSilenciado(jid, userJid);
            
            if (!silenciadoInfo || !silenciadoInfo.silenciado) {
                return await sock.sendMessage(jid, { 
                    text: `✅ @${userJid.split('@')[0]} no está silenciado.`,
                    mentions: [userJid]
                }, { quoted: message });
            }

            // Quitar silencio
            const resultado = await gestorGrupos.quitarSilencio(jid, userJid);
            
            if (resultado) {
                await sock.sendMessage(jid, { 
                    text: `✅ @${userJid.split('@')[0]} desilenciado.\nEl usuario puede volver a enviar mensajes.`,
                    mentions: [userJid]
                }, { quoted: message });

                Logger.info(`✅ Usuario ${userJid} desilenciado en ${jid} por ${sender}`);
            } else {
                throw new Error('Error al desilenciar usuario');
            }

        } catch (error) {
            Logger.error('Error en comando unmute:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al desilenciar usuario.' 
            }, { quoted: message });
        }
    }
};