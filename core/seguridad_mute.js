const Logger = require('../utils/logger');

class ManejadorMute {
    constructor() {
        this.cacheVerificaciones = new Map();
        this.cacheMensajes = new Map();
        this.usuariosNotificados = new Map();
        this.inicializarLimpiezaPeriodica();
        Logger.info('✅ ManejadorMute inicializado');
    }

    // ✅ OBTENER GESTOR DE GRUPOS DESDE FUNCIONES GLOBALES
    async obtenerGestorGrupos() {
        try {
            // Intentar obtener desde funciones globales
            if (typeof obtenerGestorComandos === 'function') {
                const gestorComandos = obtenerGestorComandos();
                if (gestorComandos && typeof gestorComandos.obtenerGestorGrupos === 'function') {
                    const gestorGrupos = gestorComandos.obtenerGestorGrupos();
                    if (gestorGrupos) {
                        return gestorGrupos;
                    }
                }
            }
            
            // Intentar obtener desde instancia del bot
            if (typeof obtenerBotInstance === 'function') {
                const botInstance = obtenerBotInstance();
                if (botInstance && typeof botInstance.obtenerGestorGrupos === 'function') {
                    const gestorGrupos = botInstance.obtenerGestorGrupos();
                    if (gestorGrupos) {
                        return gestorGrupos;
                    }
                }
            }
            
            Logger.warn('⚠️ No se pudo obtener gestor de grupos');
            return null;
        } catch (error) {
            Logger.error('❌ Error obteniendo gestor de grupos:', error);
            return null;
        }
    }

    async verificarUsuarioSilenciado(jid, usuarioId) {
        try {
            // Verificar parámetros
            if (!jid || !usuarioId) {
                Logger.warn('⚠️ Parámetros inválidos para verificarUsuarioSilenciado');
                return { silenciado: false };
            }

            // Verificar cache primero (5 segundos de cache)
            const cacheKey = `${jid}_${usuarioId}`;
            const ahora = Date.now();
            
            const cacheEntry = this.cacheVerificaciones.get(cacheKey);
            if (cacheEntry && (ahora - cacheEntry.timestamp < 5000)) {
                return cacheEntry.data;
            }

            // Obtener gestor de grupos
            const gestorGrupos = await this.obtenerGestorGrupos();
            if (!gestorGrupos) {
                Logger.warn('❌ Gestor de grupos no disponible');
                return { silenciado: false };
            }

            // Verificar si el usuario está silenciado
            if (typeof gestorGrupos.verificarSilenciado !== 'function') {
                Logger.error('❌ Método verificarSilenciado no disponible en gestorGrupos');
                return { silenciado: false };
            }

            const resultado = await gestorGrupos.verificarSilenciado(jid, usuarioId);
            
            // Validar resultado
            if (!resultado || typeof resultado !== 'object') {
                Logger.debug(`📊 Usuario ${usuarioId} no está silenciado en ${jid}`);
                const resultadoFinal = { silenciado: false };
                this.cacheVerificaciones.set(cacheKey, {
                    timestamp: ahora,
                    data: resultadoFinal
                });
                return resultadoFinal;
            }

            Logger.debug(`🔍 Resultado verificación mute para ${usuarioId}:`, resultado);

            // Guardar en cache
            this.cacheVerificaciones.set(cacheKey, {
                timestamp: ahora,
                data: resultado
            });

            return resultado;
        } catch (error) {
            Logger.error('❌ Error verificando usuario silenciado:', error);
            return { silenciado: false };
        }
    }

    async eliminarMensajeUsuarioSilenciado(sock, mensaje, jid, usuarioId, silenciadoInfo) {
        try {
            // Verificar parámetros
            if (!sock || !mensaje || !mensaje.key || !jid || !usuarioId) {
                Logger.warn('⚠️ Parámetros inválidos para eliminar mensaje');
                return false;
            }

            // Intentar eliminar el mensaje
            await sock.sendMessage(jid, { delete: mensaje.key });
            
            Logger.info(`🗑️ Mensaje eliminado de usuario silenciado: ${usuarioId} en ${jid}`);
            
            // Enviar notificación
            await this.enviarNotificacionMute(sock, jid, usuarioId, silenciadoInfo);
            
            return true;
        } catch (error) {
            if (error.message?.includes('Message not found') || 
                error.message?.includes('not found') ||
                error.message?.includes('Message was not found')) {
                Logger.debug(`📭 Mensaje ya eliminado o no encontrado: ${usuarioId}`);
            } else if (error.message?.includes('Cannot delete')) {
                Logger.warn(`⛔ No se puede eliminar mensaje (posiblemente viejo): ${usuarioId}`);
            } else {
                Logger.error('❌ Error eliminando mensaje de usuario silenciado:', error.message);
            }
            return false;
        }
    }

    async enviarNotificacionMute(sock, jid, usuarioId, silenciadoInfo) {
        try {
            const cacheKey = `${jid}_${usuarioId}_notif`;
            const ahora = Date.now();
            
            // Verificar si ya se notificó recientemente (cada 2 minutos máximo)
            const ultimaNotificacion = this.usuariosNotificados.get(cacheKey);
            if (ultimaNotificacion && (ahora - ultimaNotificacion < 120000)) {
                Logger.debug(`⏰ Notificación reciente, omitiendo para ${usuarioId}`);
                return;
            }

            // Formatear tiempo restante
            const tiempoRestante = silenciadoInfo.tiempo_restante || 0;
            let tiempoTexto = '';
            
            if (tiempoRestante > 60) {
                const horas = Math.floor(tiempoRestante / 60);
                const minutos = tiempoRestante % 60;
                tiempoTexto = `${horas}h ${minutos}m`;
            } else if (tiempoRestante > 0) {
                tiempoTexto = `${tiempoRestante} minutos`;
            } else {
                tiempoTexto = 'Poco tiempo';
            }

            const razon = silenciadoInfo.razon || 'Sin razón específica';
            const usuarioNumero = usuarioId.split('@')[0];

            // Enviar mensaje de notificación
            await sock.sendMessage(jid, {
                text: `⚠️ @${usuarioNumero} estás silenciado.\n` +
                      `⏰ Tiempo restante: ${tiempoTexto}\n` +
                      `📝 Razón: ${razon}\n\n` +
                      `🚫 No podrás enviar mensajes hasta que expire el silencio.`,
                mentions: [usuarioId]
            });

            // Registrar notificación en cache
            this.usuariosNotificados.set(cacheKey, ahora);

            Logger.info(`📢 Notificación enviada a usuario silenciado: ${usuarioId}`);

        } catch (error) {
            Logger.error('❌ Error enviando notificación de mute:', error.message);
        }
    }

    mensajeYaProcesado(mensajeKey) {
        if (!mensajeKey || !mensajeKey.id) {
            return false;
        }
        
        const cacheKey = `msg_${mensajeKey.id}`;
        const ahora = Date.now();
        
        // Limpiar cache viejo primero
        for (const [key, timestamp] of this.cacheMensajes.entries()) {
            if (ahora - timestamp > 60000) {
                this.cacheMensajes.delete(key);
            }
        }

        // Verificar si ya está en cache
        if (this.cacheMensajes.has(cacheKey)) {
            return true;
        }

        // Agregar a cache
        this.cacheMensajes.set(cacheKey, ahora);
        return false;
    }

    limpiarCachePeriodico() {
        const ahora = Date.now();
        let eliminados = 0;
        
        // Limpiar cache de verificaciones (1 minuto)
        for (const [key, entry] of this.cacheVerificaciones.entries()) {
            if (ahora - entry.timestamp > 60000) {
                this.cacheVerificaciones.delete(key);
                eliminados++;
            }
        }

        // Limpiar cache de notificaciones (5 minutos)
        for (const [key, timestamp] of this.usuariosNotificados.entries()) {
            if (ahora - timestamp > 300000) {
                this.usuariosNotificados.delete(key);
                eliminados++;
            }
        }

        // Limpiar cache de mensajes (1 minuto)
        for (const [key, timestamp] of this.cacheMensajes.entries()) {
            if (ahora - timestamp > 60000) {
                this.cacheMensajes.delete(key);
                eliminados++;
            }
        }

        if (eliminados > 0) {
            Logger.debug(`🧹 Cache limpiado: ${eliminados} entradas eliminadas`);
        }
    }

    // ✅ MÉTODO PRINCIPAL MEJORADO
    async verificarMute(sock, mensaje) {
        try {
            // Validar parámetros
            if (!sock || !mensaje || !mensaje.key) {
                Logger.warn('⚠️ Parámetros inválidos para verificarMute');
                return false;
            }

            const jid = mensaje.key.remoteJid;
            const usuarioId = mensaje.key.participant || mensaje.key.remoteJid;

            // Solo verificar en grupos
            if (!jid || !jid.endsWith('@g.us')) {
                return false;
            }

            // No verificar mensajes del bot
            if (mensaje.key.fromMe) {
                return false;
            }

            // Verificar si el mensaje ya fue procesado
            if (this.mensajeYaProcesado(mensaje.key)) {
                Logger.debug(`🔄 Mensaje ya procesado: ${mensaje.key.id}`);
                return false;
            }

            Logger.debug(`🔍 Verificando mute para usuario: ${usuarioId} en grupo: ${jid}`);

            // Verificar si el usuario está silenciado
            const silenciadoInfo = await this.verificarUsuarioSilenciado(jid, usuarioId);
            
            if (!silenciadoInfo || !silenciadoInfo.silenciado) {
                return false;
            }

            Logger.info(`🚫 USUARIO SILENCIADO DETECTADO: ${usuarioId} en ${jid}`);

            // Eliminar mensaje y notificar
            const eliminado = await this.eliminarMensajeUsuarioSilenciado(sock, mensaje, jid, usuarioId, silenciadoInfo);
            
            if (eliminado) {
                Logger.info(`✅ Mensaje eliminado exitosamente de ${usuarioId}`);
            } else {
                Logger.warn(`⚠️ No se pudo eliminar mensaje de ${usuarioId}`);
            }
            
            return eliminado;

        } catch (error) {
            Logger.error('❌ Error en verificarMute:', error);
            return false;
        }
    }

    inicializarLimpiezaPeriodica() {
        // Limpiar cache cada 30 segundos
        setInterval(() => {
            this.limpiarCachePeriodico();
        }, 30000);
        
        Logger.info('🔄 Limpieza periódica de cache inicializada');
    }

    obtenerEstadisticas() {
        return {
            cacheVerificaciones: this.cacheVerificaciones.size,
            cacheMensajes: this.cacheMensajes.size,
            usuariosNotificados: this.usuariosNotificados.size,
            estado: 'activo'
        };
    }
}

// ✅ Variables globales que serán configuradas desde conexion.js
let obtenerGestorComandos = () => {
    Logger.warn('⚠️ obtenerGestorComandos no configurado');
    return null;
};

let obtenerBotInstance = () => {
    Logger.warn('⚠️ obtenerBotInstance no configurado');
    return null;
};

// ✅ Función para configurar las funciones globales desde conexion.js
function setFuncionesGlobales(funciones) {
    if (funciones.obtenerGestorComandos) {
        obtenerGestorComandos = funciones.obtenerGestorComandos;
        Logger.info('✅ obtenerGestorComandos configurado');
    }
    if (funciones.obtenerBotInstance) {
        obtenerBotInstance = funciones.obtenerBotInstance;
        Logger.info('✅ obtenerBotInstance configurado');
    }
}

module.exports = { ManejadorMute, setFuncionesGlobales };