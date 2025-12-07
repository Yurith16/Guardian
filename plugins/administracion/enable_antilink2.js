


const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

// Esta función debe existir en tu código base para que la limpieza de cache funcione
// Si no existe, este bloque de código dará error, pero el comando principal funcionará.
function obtenerBotInstance() {
    // Implementación ficticia para evitar ReferenceError si no está definida globalmente
    return global.botInstance || { manejadorConexion: { manejadorAntilink2: { limpiarCacheGrupo: () => {} } } };
}

module.exports = {
    command: ['enable_antilink', 'activar_antilink', 'on_antilink'],
    description: 'Activar protección ANTILINK UNIVERSAL',
    isGroup: true,
    isPrivate: false,
    isAdmin: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const adminNumero = sender.split('@')[0];

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

            // Crear instancia directa del gestor de grupos
            let gestorGrupos;
            try {
                gestorGrupos = new GestorGrupos();
            } catch (error) {
                Logger.error('Error creando gestor de grupos:', error);
                // 2. MENSAJE DE ERROR DB REDUCIDO
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
                    // 3. MENSAJE DE ERROR INICIALIZACIÓN REDUCIDO
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error al inicializar.' 
                    }, { quoted: message });
                }
            }

            // Asegurar que exista configuraciones
            if (!datosGrupo.configuraciones) {
                datosGrupo.configuraciones = {};
            }

            // Verificar si ya está activado
            const estadoActual = datosGrupo.configuraciones.antilink2 === true;
            
            if (estadoActual) {
                // 4. MENSAJE YA ACTIVADO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '⚠️ Antilink ya *activado*.' 
                }, { quoted: message });
            }

            // Activar antilink2
            datosGrupo.configuraciones.antilink2 = true;

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                // 5. MENSAJE ERROR GUARDADO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar.' 
                }, { quoted: message });
            }

            // Limpieza de cache (mantenido por necesidad funcional)
            try {
                const botInstance = obtenerBotInstance();
                if (botInstance && botInstance.manejadorConexion && botInstance.manejadorConexion.manejadorAntilink2 && botInstance.manejadorConexion.manejadorAntilink2.limpiarCacheGrupo) {
                    botInstance.manejadorConexion.manejadorAntilink2.limpiarCacheGrupo(jid);
                    Logger.info(`🧹 Cache limpiado para ${jid} después de activar antilink2`);
                }
            } catch (cacheError) {
                Logger.warn('No se pudo limpiar cache:', cacheError.message);
            }
            
            // 6. MENSAJE DE CONFIRMACIÓN REDUCIDO Y ETIQUETADO
            await sock.sendMessage(jid, { 
                text: `✅ Antilink *ACTIVADO* por @${adminNumero}.`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Antilink2 ACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando enableantilink2:', error);

            try {
                // 7. MENSAJE DE ERROR DE EJECUCIÓN REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Error al activar.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};