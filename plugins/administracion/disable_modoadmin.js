const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['disable modoadmin', 'desactivar modoadmin', 'modoadmin off'],
    description: 'Desactivar modo solo administradores (el bot responderá a todos)',
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
                    text: '❌ Solo administradores pueden cambiar este modo.' 
                }, { quoted: message });
            }

            // Crear instancia del gestor de grupos
            const gestorGrupos = new GestorGrupos();

            // Obtener datos actuales
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
                if (!datosGrupo) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error al inicializar grupo.' 
                    }, { quoted: message });
                }
            }

            // Verificar si ya está desactivado
            const modoAdminActivo = datosGrupo.configuraciones?.modo_admin === true;
            if (!modoAdminActivo) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ El modo solo administradores ya está desactivado.\n\n' +
                          '📝 *Estado actual:*\n' +
                          '• 🤖 Bot: Responde a TODOS los usuarios\n' +
                          '• 👥 Usuarios normales: Pueden usar comandos\n' +
                          '• 👑 Administradores: Acceso completo\n\n' +
                          'Usa *enable modoadmin* para activar.'
                }, { quoted: message });
            }

            // Desactivar modo admin
            const desactivado = await gestorGrupos.desactivarModoAdmin(jid);
            
            if (!desactivado) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al desactivar modo administrador.' 
                }, { quoted: message });
            }

            const adminNumero = sender.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ *MODO SOLO ADMINISTRADORES DESACTIVADO*\n\n` +
                      `👑 Desactivado por: @${adminNumero}\n\n` +
                      `📋 *Cambios aplicados:*\n` +
                      `• 🤖 El bot responderá a TODOS los usuarios\n` +
                      `• 👥 Usuarios normales: Pueden usar comandos\n` +
                      `• 👑 Administradores: Acceso completo\n` +
                      `• ⚙️ Configuración guardada para este grupo\n\n` +
                      `🔄 Para reactivar usa: *enable modoadmin*`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Modo admin DESACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en disable modoadmin:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al desactivar modo administrador.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};