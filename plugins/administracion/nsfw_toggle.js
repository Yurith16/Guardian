// plugins/administracion/nsfw_toggle.js

const Logger = require('../../utils/logger');
// ⚠️ Asegúrate de que esta ruta a tu GestorGrupos sea correcta
const GestorGrupos = require('../../database/GestorGrupos'); 
// ⚠️ Asegúrate de que esta ruta a tu Handler de comandos sea correcta para utilidades
const { getPrefix } = require('../../handlers/commandHandler'); 

const gestorGrupos = new GestorGrupos();

module.exports = {
    command: ['nsfw', 'nsfwtoggle'],
    aliases: ['nsfwstatus', 'nsfwenable', 'nsfwdisable'],
    description: 'Activa o desactiva todos los comandos NSFW en este grupo.',
    usage: '<enable|disable|status>',
    isGroup: true,
    isPrivate: false,
    isAdmin: true, // Requerido para Administradores del grupo
    isOwner: true, // Requerido también para el Owner del Bot (por seguridad)

    async execute(sock, m, args) {
        const jid = m.key.remoteJid;
        const currentPrefix = getPrefix();
        
        try {
            const action = args[0]?.toLowerCase();
            let nuevoEstado;
            let mensaje;

            if (action === 'enable' || action === 'activar') {
                nuevoEstado = true;
                await gestorGrupos.actualizarEstadoNSFW(jid, nuevoEstado);
                mensaje = "✅ *COMANDOS NSFW HABILITADOS*\n\n" +
                          "Los comandos de la categoría NSFW ya están disponibles en este grupo.";
            } else if (action === 'disable' || action === 'desactivar') {
                nuevoEstado = false;
                await gestorGrupos.actualizarEstadoNSFW(jid, nuevoEstado);
                mensaje = "❌ *COMANDOS NSFW DESHABILITADOS*\n\n" +
                          "Los comandos de la categoría NSFW han sido desactivados en este grupo.";
            } else {
                const estadoActual = await gestorGrupos.obtenerEstadoNSFW(jid);
                const status = estadoActual ? '✅ HABILITADO' : '❌ DESHABILITADO';
                
                return await sock.sendMessage(jid, {
                    text: `> 🔞 *ESTADO NSFW GRUPAL*\n\n` +
                          `*Estado actual:* ${status}\n\n` +
                          `*Uso:*\n` +
                          `• *${currentPrefix}nsfw enable* (Activar)\n` +
                          `• *${currentPrefix}nsfw disable* (Desactivar)`
                }, { quoted: m });
            }

            await sock.sendMessage(jid, { text: mensaje }, { quoted: m });
            Logger.info(`[NSFW Toggle] ${jid}: Comandos NSFW ${nuevoEstado ? 'habilitados' : 'deshabilitados'}.`);

        } catch (error) {
            Logger.error('Error en comando nsfw_toggle:', error);
            await sock.sendMessage(jid, { text: '❌ Error interno al procesar el comando NSFW. Consulta el log.' }, { quoted: m });
        }
    }
};