const Logger = require('../utils/logger');

class ManejadorMute {
    constructor() {
        this.cacheVerificaciones = new Map(); // Cache para evitar verificar lo mismo muchas veces
        this.cacheMensajes = new Map(); // Cache de mensajes recientes para evitar doble procesamiento
        this.usuariosNotificados = new Map(); // Usuarios a los que ya se les notificó
    }

    // Obtener gestor de grupos desde el bot principal
    obtenerGestorGrupos() {
        try {
            const bot = require('../main');
            const gestorComandos = bot.obtenerGestorComandos();
            
            if (!gestorComandos) {
                Logger.error('❌ Gestor de comandos no disponible');
                return null;
            }

            const gestorGrupos = gestorComandos.obtenerGestorGrupos();
            
            if (!gestorGrupos) {
                Logger.warn('⚠️ Gestor de grupos no disponible');
                return null;
            }

            return gestorGrupos;
        } catch (error) {
            Logger.error('Error obteniendo gestor de grupos:', error.message);
            return null;
        }
    }

    // Verificar si un usuario está silenciado en un grupo
    async verificarUsuarioSilenciado(jid, usuarioId) {
        try {
            // Verificar cache primero
            const cacheKey = `${jid}_${usuarioId}`;
            const ahora = Date.now();
            
            const cacheEntry = this.cacheVerificaciones.get(cacheKey);
            if (cacheEntry && (ahora - cacheEntry.timestamp < 30000)) { // 30 segundos de cache
                return cacheEntry.data;
            }

            const gestorGrupos = this.obtenerGestorGrupos();
            if (!gestorGrupos) {
                return { silenciado: false };
            }

            // Verificar si el usuario está silenciado
            const resultado = await gestorGrupos.verificarSilenciado(jid, usuarioId);
            
            // Guardar en cache
            this.cacheVerificaciones.set(cacheKey, {
                timestamp: ahora,
                data: resultado
            });

            return resultado;
        } catch (error) {
            Logger.error('Error verificando usuario silenciado:', error);
            return { silenciado: false };
        }
    }

    // Eliminar mensaje de usuario silenciado
    async eliminarMensajeUsuarioSilenciado(sock, mensaje, jid, usuarioId, silenciadoInfo) {
        try {
            // Intentar eliminar el mensaje
            await sock.sendMessage(jid, { delete: mensaje.key });
            
            Logger.info(`🗑️ Mensaje eliminado de usuario silenciado: ${usuarioId} en ${jid}`);
            
            // Enviar notificación (máximo una cada 2 minutos por usuario)
            await this.enviarNotificacionMute(sock, jid, usuarioId, silenciadoInfo);
            
            return true;
        } catch (error) {
            if (error.message.includes('Message not found')) {
                Logger.debug(`Mensaje ya eliminado o no encontrado: ${usuarioId}`);
            } else {
                Logger.error('Error eliminando mensaje de usuario silenciado:', error.message);
            }
            return false;
        }
    }

    // Enviar notificación de mute al usuario
    async enviarNotificacionMute(sock, jid, usuarioId, silenciadoInfo) {
        try {
            const cacheKey = `${jid}_${usuarioId}_notif`;
            const ahora = Date.now();
            
            // Verificar si ya se notificó recientemente (cada 2 minutos máximo)
            const ultimaNotificacion = this.usuariosNotificados.get(cacheKey);
            if (ultimaNotificacion && (ahora - ultimaNotificacion < 120000)) {
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

            // Enviar mensaje de notificación
            await sock.sendMessage(jid, {
                text: `⚠️ @${usuarioId.split('@')[0]} estás silenciado.\n` +
                      `⏰ Tiempo restante: ${tiempoTexto}\n` +
                      `📝 Razón: ${silenciadoInfo.razon || 'Sin razón específica'}\n\n` +
                      `🚫 No podrás enviar mensajes hasta que expire el silencio.`,
                mentions: [usuarioId]
            });

            // Registrar notificación en cache
            this.usuariosNotificados.set(cacheKey, ahora);

            Logger.info(`📢 Notificación enviada a usuario silenciado: ${usuarioId}`);

        } catch (error) {
            Logger.error('Error enviando notificación de mute:', error.message);
        }
    }

    // Verificar si el mensaje ya fue procesado (evitar doble procesamiento)
    mensajeYaProcesado(mensajeKey) {
        const cacheKey = `msg_${mensajeKey.id}`;
        const ahora = Date.now();
        
        // Limpiar cache viejo primero
        for (const [key, timestamp] of this.cacheMensajes.entries()) {
            if (ahora - timestamp > 60000) { // 1 minuto
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

    // Limpiar cache periódicamente
    limpiarCachePeriodico() {
        const ahora = Date.now();
        
        // Limpiar cache de verificaciones (5 minutos)
        for (const [key, entry] of this.cacheVerificaciones.entries()) {
            if (ahora - entry.timestamp > 300000) {
                this.cacheVerificaciones.delete(key);
            }
        }

        // Limpiar cache de notificaciones (10 minutos)
        for (const [key, timestamp] of this.usuariosNotificados.entries()) {
            if (ahora - timestamp > 600000) {
                this.usuariosNotificados.delete(key);
            }
        }
    }

    // Método principal para verificar usuarios silenciados
    async verificarMute(sock, mensaje) {
        try {
            const jid = mensaje.key.remoteJid;
            const usuarioId = mensaje.key.participant || mensaje.key.remoteJid;

            // Solo verificar en grupos
            if (!jid.endsWith('@g.us')) {
                return false;
            }

            // No verificar mensajes del bot
            if (mensaje.key.fromMe) {
                return false;
            }

            // Verificar si el mensaje ya fue procesado
            if (this.mensajeYaProcesado(mensaje.key)) {
                return false;
            }

            // Verificar si el usuario está silenciado
            const silenciadoInfo = await this.verificarUsuarioSilenciado(jid, usuarioId);
            
            if (!silenciadoInfo || !silenciadoInfo.silenciado) {
                return false;
            }

            Logger.info(`🚫 Usuario silenciado intentó enviar mensaje: ${usuarioId} en ${jid}`);

            // Eliminar mensaje y notificar
            await this.eliminarMensajeUsuarioSilenciado(sock, mensaje, jid, usuarioId, silenciadoInfo);
            
            return true;

        } catch (error) {
            Logger.error('Error en verificarMute:', error);
            return false;
        }
    }

    // Verificar múltiples usuarios al mismo tiempo (para eventos como unirse al grupo)
    async verificarUsuariosSilenciados(sock, jid, usuariosIds) {
        try {
            const resultados = [];
            
            for (const usuarioId of usuariosIds) {
                const silenciadoInfo = await this.verificarUsuarioSilenciado(jid, usuarioId);
                
                if (silenciadoInfo && silenciadoInfo.silenciado) {
                    resultados.push({
                        usuarioId,
                        silenciadoInfo
                    });
                }
            }
            
            return resultados;
        } catch (error) {
            Logger.error('Error verificando múltiples usuarios:', error);
            return [];
        }
    }

    // Obtener estadísticas del sistema de mute
    obtenerEstadisticas() {
        return {
            cacheVerificaciones: this.cacheVerificaciones.size,
            cacheMensajes: this.cacheMensajes.size,
            usuariosNotificados: this.usuariosNotificados.size
        };
    }

    // Inicializar limpieza periódica de cache
    inicializarLimpiezaPeriodica() {
        setInterval(() => {
            this.limpiarCachePeriodico();
        }, 300000); // Cada 5 minutos
    }
}

module.exports = ManejadorMute;