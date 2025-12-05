const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['enableantilink', 'activarantilink', 'onantilink'],
    description: 'Activar protección ANTILINK UNIVERSAL',
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

            // Asegurar que exista configuraciones
            if (!datosGrupo.configuraciones) {
                datosGrupo.configuraciones = {};
            }

            // Verificar si ya está activado
            const estadoActual = datosGrupo.configuraciones.antilink2 === true;
            
            if (estadoActual) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ Antilink general ya activado.' 
                }, { quoted: message });
            }

            // Activar antilink2
            datosGrupo.configuraciones.antilink2 = true;

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar.' 
                }, { quoted: message });
            }

            // ✅ IMPORTANTE: Limpiar cache del manejador antilink2
            try {
                // Obtener el manejador antilink2 desde la conexión
                const botInstance = obtenerBotInstance();
                if (botInstance && botInstance.manejadorConexion) {
                    const manejadorConexion = botInstance.manejadorConexion;
                    if (manejadorConexion.manejadorAntilink2 && manejadorConexion.manejadorAntilink2.limpiarCacheGrupo) {
                        manejadorConexion.manejadorAntilink2.limpiarCacheGrupo(jid);
                        Logger.info(`🧹 Cache limpiado para ${jid} después de activar antilink2`);
                    }
                }
            } catch (cacheError) {
                Logger.warn('No se pudo limpiar cache:', cacheError.message);
            }

            const adminNumero = sender.split('@')[0];
            
            await sock.sendMessage(jid, { 
                text: `✅ Antilink general activado por @${adminNumero}\n\n🔹 *Características:*\n• Bloquea TODOS los enlaces\n• Incluye WhatsApp, Facebook, Instagram, etc.\n• Afecta a todos los miembros`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Antilink2 ACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando enableantilink2:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al activar.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};