 /* const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['disable_antilink', 'desactivar_antilink', 'off_antilink'],
    description: 'Desactivar protección antilink medio',
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
                    text: '❌ Solo administradores.' 
                }, { quoted: message });
            }

            // Crear instancia directa del gestor de grupos
            let gestorGrupos;
            try {
                gestorGrupos = new GestorGrupos();
            } catch (error) {
                Logger.error('Error creando gestor de grupos:', error);
                return await sock.sendMessage(jid, { 
                    text: '❌ Error en base de datos.' 
                }, { quoted: message });
            }

            // Obtener datos actuales del grupo
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);

            // Si no existe, inicializar el grupo
            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
                if (!datosGrupo) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error al inicializar.' 
                    }, { quoted: message });
                }
            }

            // Verificar si ya está desactivado
            const estadoActual = datosGrupo.configuraciones?.antilink === false;
            
            if (estadoActual) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ Antilink medio ya desactivado.' 
                }, { quoted: message });
            }

            // Desactivar antilink
            datosGrupo.configuraciones.antilink = false;

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar.' 
                }, { quoted: message });
            }

            const adminNumero = sender.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ Sistema de antilink medio desactivado por @${adminNumero}`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Antilink medio DESACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando disableantilink:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al desactivar.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};
*/