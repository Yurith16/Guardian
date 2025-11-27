const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['disable_antispam', 'antispam_off'],
    description: 'Desactivar protección antispam (Solo Admins)',
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
                    text: '❌ Solo los administradores pueden usar este comando.' 
                }, { quoted: message });
            }

            // Crear instancia del gestor de grupos
            const gestorGrupos = new GestorGrupos();

            // Obtener datos actuales del grupo
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);

            // Si no existe, inicializar el grupo
            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
                if (!datosGrupo) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error al inicializar grupo en la base de datos.' 
                    }, { quoted: message });
                }
            }

            // Desactivar antispam
            datosGrupo.configuraciones.antispam = false;

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar la configuración.' 
                }, { quoted: message });
            }

            const mensaje = `🔴 *PROTECCIÓN ANTISPAM DESACTIVADA*\n\n` +
                           `⚠️ *Advertencia:* El grupo ya no está protegido contra spam masivo\n` +
                           `💡 *Recomendación:* Mantén esta protección activada para seguridad del grupo`;

            await sock.sendMessage(jid, { 
                text: mensaje 
            }, { quoted: message });

            Logger.info(`✅ Antispam desactivado en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en disable_antispam:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al desactivar la protección antispam.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};