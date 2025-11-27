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
                    text: '❌ Error sistema' 
                }, { quoted: message });
            }

            const datosGrupo = await gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error grupo' 
                }, { quoted: message });
            }

            if (!datosGrupo.configuraciones) {
                datosGrupo.configuraciones = { antilink: true };
            }

            const estadoActual = datosGrupo.configuraciones.antilink !== false;
            
            if (!args[0]) {
                return await sock.sendMessage(jid, { 
                    text: `🛡️ Antilink: ${estadoActual ? '✅ ACTIVADO' : '❌ DESACTIVADO'}` 
                }, { quoted: message });
            }

            const accion = args[0].toLowerCase();
            let nuevoEstado;

            if (accion === 'on' || accion === 'activar') {
                nuevoEstado = true;
            } else if (accion === 'off' || accion === 'desactivar') {
                nuevoEstado = false;
            } else {
                return await sock.sendMessage(jid, { 
                    text: '💡 antilink on/off' 
                }, { quoted: message });
            }

            datosGrupo.configuraciones.antilink = nuevoEstado;
            await gestorGrupos.guardarDatos(jid, datosGrupo);

            await sock.sendMessage(jid, { 
                text: nuevoEstado ? '✅ Antilink activado' : '❌ Antilink desactivado' 
            }, { quoted: message });

        } catch (error) {
            await sock.sendMessage(jid, { 
                text: '❌ Error' 
            }, { quoted: message });
        }
    }
};