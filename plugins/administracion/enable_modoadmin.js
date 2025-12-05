const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['enable modoadmin', 'activar modoadmin', 'modoadmin on'],
    description: 'Activar modo solo administradores (el bot solo responderá a admins)',
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

            // Verificar si ya está activado
            const modoAdminActivo = datosGrupo.configuraciones?.modo_admin === true;
            if (modoAdminActivo) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ El modo solo administradores ya está activado.\n\n' +
                          '📝 *Estado actual:*\n' +
                          '• 🤖 Bot: Solo responde a administradores\n' +
                          '• 👥 Usuarios normales: No pueden usar comandos\n' +
                          '• 👑 Administradores: Acceso completo\n\n' +
                          'Usa *disable modoadmin* para desactivar.'
                }, { quoted: message });
            }

            // Activar modo admin
            const activado = await gestorGrupos.activarModoAdmin(jid);
            
            if (!activado) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al activar modo administrador.' 
                }, { quoted: message });
            }

            const adminNumero = sender.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ *MODO SOLO ADMINISTRADORES ACTIVADO*\n\n` +
                      `👑 Activado por: @${adminNumero}\n\n` +
                      `📋 *Cambios aplicados:*\n` +
                      `• 🤖 El bot solo responderá a administradores\n` +
                      `• 👥 Usuarios normales NO podrán usar comandos\n` +
                      `• 👑 Administradores tienen acceso completo\n` +
                      `• ⚙️ Configuración guardada para este grupo\n\n` +
                      `🔄 Para desactivar usa: *disable modoadmin*`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Modo admin ACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en enable modoadmin:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al activar modo administrador.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};