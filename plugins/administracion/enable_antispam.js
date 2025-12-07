const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['enable_antispam', 'antispam_on'],
    description: 'Activar protección antispam (Solo Admins)',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);

            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                // 1. MENSAJE DE PERMISO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo Admins.' 
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
                    // 2. MENSAJE DE ERROR DE INICIALIZACIÓN REDUCIDO
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error en base de datos.' 
                    }, { quoted: message });
                }
            }

            // Verificar si ya está activado para no enviar el mensaje detallado otra vez
            if (datosGrupo.configuraciones && datosGrupo.configuraciones.antispam === true) {
                 return await sock.sendMessage(jid, { 
                    text: '⚠️ Antispam ya *ACTIVADO*.' 
                 }, { quoted: message });
            }

            // Activar antispam
            if (!datosGrupo.configuraciones) datosGrupo.configuraciones = {};
            datosGrupo.configuraciones.antispam = true;

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                // 3. MENSAJE DE ERROR DE GUARDADO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar la configuración.' 
                }, { quoted: message });
            }

            // 4. MENSAJE DE CONFIRMACIÓN MÁS CORTO
            await sock.sendMessage(jid, { 
                text: '🟢 Antispam *ACTIVADO*.' 
            }, { quoted: message });

            Logger.info(`✅ Antispam activado en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en enable_antispam:', error);

            try {
                // 5. MENSAJE DE ERROR DE EJECUCIÓN REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Error al activar antispam.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};