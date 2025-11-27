const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

let gestorGruposGlobal = null;

function obtenerGestorGrupos() {
    if (!gestorGruposGlobal) {
        try {
            gestorGruposGlobal = new GestorGrupos();
        } catch (error) {
            return null;
        }
    }
    return gestorGruposGlobal;
}

module.exports = {
    command: ['antilink'],
    description: 'Activar/desactivar antilink',
    isOwner: false,
    isAdmin: true,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const gestorGrupos = obtenerGestorGrupos();
            if (!gestorGrupos) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Sistema no disponible' 
                }, { quoted: message });
            }

            const datosGrupo = await gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Grupo no registrado' 
                }, { quoted: message });
            }

            if (!datosGrupo.configuraciones) {
                datosGrupo.configuraciones = { antilink: true };
            }

            const estadoActual = datosGrupo.configuraciones.antilink !== false;

            if (!args[0]) {
                return await sock.sendMessage(jid, { 
                    text: `🛡️ *ANTILINK*\n\nEstado: ${estadoActual ? '✅ ON' : '❌ OFF'}\n\n*antilink on* - Activar\n*antilink off* - Desactivar` 
                }, { quoted: message });
            }

            const accion = args[0].toLowerCase();
            let nuevoEstado;
            let mensajeEstado;

            if (accion === 'on' || accion === 'activar') {
                nuevoEstado = true;
                mensajeEstado = '✅ *ANTILINK ON*\n\n🛡️ Enlaces bloqueados\n🔗 YouTube, Instagram, TikTok\n🔗 Twitter, Pinterest, Facebook\n🚫 Otros eliminados';
            } else if (accion === 'off' || accion === 'desactivar') {
                nuevoEstado = false;
                mensajeEstado = '❌ *ANTILINK OFF*\n\n🔓 Todos enlaces permitidos';
            } else {
                return await sock.sendMessage(jid, { 
                    text: '💡 *antilink [on/off]*' 
                }, { quoted: message });
            }

            datosGrupo.configuraciones.antilink = nuevoEstado;
            await gestorGrupos.guardarDatos(jid, datosGrupo);

            await sock.sendMessage(jid, { 
                text: mensajeEstado 
            }, { quoted: message });

            Logger.info(`✅ Antilink ${nuevoEstado ? 'ON' : 'OFF'} ${jid}`);

        } catch (error) {
            Logger.error('Error antilink:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error configurando' 
            }, { quoted: message });
        }
    }
};