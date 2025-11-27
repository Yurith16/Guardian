const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['resetwarn', 'resetadvertencias'],
    description: 'Eliminar todas las advertencias de usuario',
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
                    text: '❌ Solo administradores.' 
                }, { quoted: message });
            }

            // Verificar mención
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Menciona al usuario.\nEj: .resetwarn @usuario' 
                }, { quoted: message });
            }

            const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            const datosGrupo = await gestorGrupos.obtenerDatos(jid);

            if (!datosGrupo || !datosGrupo.advertencias || !datosGrupo.advertencias[userJid]) {
                return await sock.sendMessage(jid, { 
                    text: `✅ @${userJid.split('@')[0]} no tiene advertencias.`,
                    mentions: [userJid]
                }, { quoted: message });
            }

            const advertenciasEliminadas = datosGrupo.advertencias[userJid].count;

            // Eliminar todas las advertencias
            delete datosGrupo.advertencias[userJid];
            await gestorGrupos.guardarDatos(jid, datosGrupo);

            await sock.sendMessage(jid, { 
                text: `🔄 *SEGUNDA OPORTUNIDAD*\n👤 @${userJid.split('@')[0]}\n✅ ${advertenciasEliminadas} advertencias eliminadas\n\n¡Nuevo comienzo!`,
                mentions: [userJid]
            }, { quoted: message });

            Logger.info(`✅ Advertencias reseteadas para ${userJid} en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en resetwarn:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al resetear advertencias' 
            }, { quoted: message });
        }
    }
};