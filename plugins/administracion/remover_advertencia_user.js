const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['unwarn', 'quitaradvertencia', 'deletewarn'],
    description: 'Quitar advertencia a usuario',
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
                    text: '❌ Menciona al usuario.\nEj: .unwarn @usuario' 
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

            const advertenciasAntes = datosGrupo.advertencias[userJid].count;

            if (advertenciasAntes <= 1) {
                // Eliminar usuario de advertencias si era la última
                delete datosGrupo.advertencias[userJid];
                await gestorGrupos.guardarDatos(jid, datosGrupo);

                await sock.sendMessage(jid, { 
                    text: `✅ @${userJid.split('@')[0]} eliminado de advertencias.`,
                    mentions: [userJid]
                }, { quoted: message });
            } else {
                // Reducir contador
                datosGrupo.advertencias[userJid].count--;
                // Remover la última advertencia del historial
                datosGrupo.advertencias[userJid].historial.pop();

                await gestorGrupos.guardarDatos(jid, datosGrupo);

                const advertenciasAhora = datosGrupo.advertencias[userJid].count;
                await sock.sendMessage(jid, { 
                    text: `✅ Advertencia removida.\n👤 @${userJid.split('@')[0]}\n📊 ${advertenciasAhora}/3 advertencias`,
                    mentions: [userJid]
                }, { quoted: message });
            }

            Logger.info(`✅ Advertencia removida a ${userJid} en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en unwarn:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al quitar advertencia' 
            }, { quoted: message });
        }
    }
};