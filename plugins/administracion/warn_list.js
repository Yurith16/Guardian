const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['warnlist', 'listaadvertencias'],
    description: 'Mostrar lista de usuarios advertidos',
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

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            const datosGrupo = await gestorGrupos.obtenerDatos(jid);

            if (!datosGrupo || !datosGrupo.advertencias || Object.keys(datosGrupo.advertencias).length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '✅ No hay usuarios advertidos en este grupo.' 
                }, { quoted: message });
            }

            let mensaje = `📋 *LISTA DE ADVERTENCIAS*\n\n`;
            const mencionados = [];

            for (const [userJid, datos] of Object.entries(datosGrupo.advertencias)) {
                const numero = userJid.split('@')[0];
                mencionados.push(userJid);

                mensaje += `👤 @${numero}\n` +
                          `⚠️ ${datos.count}/3 advertencias\n` +
                          `📝 Última razón: ${datos.historial[datos.historial.length - 1]?.razon || 'N/A'}\n\n`;
            }

            mensaje += `📊 Total: ${Object.keys(datosGrupo.advertencias).length} usuarios advertidos`;

            await sock.sendMessage(jid, { 
                text: mensaje,
                mentions: mencionados
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en warnlist:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener lista' 
            }, { quoted: message });
        }
    }
};