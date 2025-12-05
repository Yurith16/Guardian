const Logger = require('../utils/logger');

class ManejadorAntilink2 {
    constructor() {
        this.gestorGrupos = null;
        // Se elimina la lógica de advertencias (usuariosAdvertencias)
        this.cacheGrupos = {}; // Cache para configuraciones
        this.inicializarLimpiezaPeriodica();
        Logger.info('✅ ManejadorAntilink2 (expulsión directa) inicializado');
    }

    // Inicializar gestor de grupos directamente
    async inicializarGestorGrupos() {
        try {
            if (!this.gestorGrupos) {
                const GestorGrupos = require('../database/gestorGrupos');
                this.gestorGrupos = new GestorGrupos();
                Logger.info('✅ Gestor de grupos inicializado en Antilink2');
            }
            return this.gestorGrupos;
        } catch (error) {
            Logger.error('❌ Error inicializando gestor de grupos:', error);
            return null;
        }
    }

    // Verificar si antilink2 está activo en un grupo (CON CACHE)
    async verificarAntilink2Activo(jid) {
        try {
            // CACHE para mejor rendimiento (30 segundos)
            const cacheKey = `antilink2_${jid}`;
            const cacheTime = 30000; // 30 segundos
            
            if (this.cacheGrupos[cacheKey]) {
                const cacheData = this.cacheGrupos[cacheKey];
                if (Date.now() - cacheData.timestamp < cacheTime) {
                    Logger.debug(`📦 Cache usado para ${jid}: ${cacheData.activo ? 'ACTIVO' : 'INACTIVO'}`);
                    return cacheData.activo;
                }
            }
            
            if (!this.gestorGrupos) {
                await this.inicializarGestorGrupos();
                if (!this.gestorGrupos) {
                    Logger.warn(`⚠️ No hay gestor de grupos para ${jid}`);
                    return false;
                }
            }

            const datosGrupo = await this.gestorGrupos.obtenerDatos(jid);
            let activo = false;
            
            if (!datosGrupo) {
                Logger.debug(`📁 Grupo no encontrado en BD: ${jid}, antilink2 desactivado por defecto`);
            } else if (!datosGrupo.configuraciones) {
                Logger.debug(`⚙️ Sin configuraciones para ${jid}, antilink2 desactivado`);
            } else {
                activo = datosGrupo.configuraciones.antilink2 === true;
                Logger.debug(`🔍 Configuración leída para ${jid}: antilink2 = ${activo}`);
            }
            
            // GUARDAR EN CACHE
            this.cacheGrupos[cacheKey] = {
                activo: activo,
                timestamp: Date.now(),
                jid: jid
            };
            
            return activo;
        } catch (error) {
            Logger.error('❌ Error verificando antilink2:', error);
            return false;
        }
    }

    // Limpiar cache de un grupo específico (cuando cambia configuración)
    limpiarCacheGrupo(jid) {
        const clave = `antilink2_${jid}`;
        if (this.cacheGrupos[clave]) {
            delete this.cacheGrupos[clave];
            Logger.info(`🧹 Cache limpiado para grupo: ${jid}`);
        }
        
        // Se elimina la limpieza de advertencias
    }

    // Extraer texto de cualquier tipo de mensaje
    extraerTextoMensaje(mensaje) {
        try {
            const msg = mensaje.message;
            if (!msg) return '';

            // Prioriza texto simple y captions de multimedia/documentos
            if (msg.conversation) return msg.conversation;
            if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
            if (msg.imageMessage?.caption) return msg.imageMessage.caption;
            if (msg.videoMessage?.caption) return msg.videoMessage.caption;
            if (msg.documentMessage?.caption) return msg.documentMessage.caption;
            
            return '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Detectar URLs de forma robusta para spam.
     * Detecta: http(s)://..., www...., o cualquier palabra seguida de al menos un punto y otra palabra (ej: "mi.enlace")
     * Se usa un patrón más estricto que requiere un dominio completo o un prefijo claro.
     */
    contieneEnlacesUniversal(texto) {
        if (!texto || typeof texto !== 'string') return false;
        
        // Patrón robusto para detectar links
        // (https?://|whatsapp\.com|wa\.me|t\.me|www\.|\.com|\.net|\.org|\.xyz|\.app|\.biz)
        // Añadí más TLDs comunes y dominios específicos de mensajería (wa.me, t.me)
        const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|\.com|\.net|\.org|\.xyz|\.app)/gi;
        
        // Comprobar si el texto coincide con el patrón de URL.
        const matches = texto.match(urlPattern);

        if (matches) {
            // Filtrar y logear para debug, si es necesario.
            const links = matches.filter(match => match.length > 5); // Evitar falsos positivos muy cortos
            if (links.length > 0) {
                Logger.debug(`🔗 Enlaces detectados en el texto: ${links.join(', ')}`);
                return true;
            }
        }
        return false;
    }


    // MÉTODO NUEVO: Eliminar mensaje y expulsar usuario inmediatamente
    async expulsarUsuarioPorEnlace(sock, mensaje, jid, usuarioId) {
        const usuarioNumero = usuarioId.split('@')[0];
        
        Logger.info(`🚫 ENLACE DETECTADO. Expulsando: ${usuarioId} en ${jid}`);
        
        // 1. ELIMINAR MENSAJE
        try {
            await sock.sendMessage(jid, { delete: mensaje.key });
            Logger.info(`🗑️ Mensaje con enlace eliminado: ${usuarioId}`);
        } catch (deleteError) {
            Logger.debug(`No se pudo eliminar mensaje: ${deleteError.message}`);
            // Continuar con la expulsión incluso si falla la eliminación
        }
        
        // 2. EXPULSAR USUARIO
        try {
            await sock.groupParticipantsUpdate(jid, [usuarioId], 'remove');
            Logger.info(`❌ Usuario expulsado por enlace: ${usuarioId}`);
            
            // 3. ENVIAR NOTIFICACIÓN
            await sock.sendMessage(jid, {
                text: `🚫 *USUARIO EXPULSADO*\n\n👤 @${usuarioNumero}\n\n⛔ *MOTIVO:* Envío de enlaces. El Antilink2 está configurado para la expulsión inmediata.`,
                mentions: [usuarioId]
            });
            
            return true;
        } catch (kickError) {
            Logger.error(`Error expulsando usuario ${usuarioId}: ${kickError.message}`);
            // Enviar un mensaje de advertencia si la expulsión falla (e.g., el bot no es admin)
            await sock.sendMessage(jid, {
                text: `⚠️ *ACCIÓN FALLIDA*\n\n🚫 Detecté un enlace de @${usuarioNumero}, pero no pude expulsarle. Asegúrate de que el bot sea *Administrador* para que el Antilink2 funcione correctamente.`,
                mentions: [usuarioId]
            });
            return false;
        }
    }

    // Verificar si usuario es admin
    async esAdministrador(sock, jid, usuarioId) {
        try {
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === usuarioId);
            return participant && ['admin', 'superadmin'].includes(participant.admin);
        } catch (error) {
            // Si falla la metadata, asumimos que no es admin para ser más seguro.
            return false;
        }
    }

    // MÉTODO PRINCIPAL CORREGIDO
    async verificarAntilink2(sock, mensaje) {
        try {
            if (!sock || !mensaje || !mensaje.key) {
                return false;
            }

            const jid = mensaje.key.remoteJid;
            const usuarioId = mensaje.key.participant || mensaje.key.remoteJid;

            // Solo grupos y no mensajes del bot
            if (!jid || !jid.endsWith('@g.us') || mensaje.key.fromMe) {
                return false;
            }

            // 1. Verificar si antilink2 está activo (usa cache)
            const antilinkActivo = await this.verificarAntilink2Activo(jid);
            
            if (!antilinkActivo) {
                return false;
            }

            Logger.debug(`🔒 Antilink2 ACTIVO en ${jid}, verificando mensaje...`);

            // 2. Verificar si es admin
            const esAdmin = await this.esAdministrador(sock, jid, usuarioId);
            if (esAdmin) {
                // Admins pueden enviar enlaces
                Logger.debug(`👑 Admin ${usuarioId} puede enviar enlaces`);
                return false; 
            }

            // 3. Extracción de texto y detección de enlaces
            const texto = this.extraerTextoMensaje(mensaje);
            if (!texto) {
                return false;
            }

            const contieneEnlaces = this.contieneEnlacesUniversal(texto);
            
            if (contieneEnlaces) {
                // 4. ACCIÓN: Expulsión inmediata
                await this.expulsarUsuarioPorEnlace(sock, mensaje, jid, usuarioId);
                return true; // Se detectó y procesó el enlace
            }

            return false;
        } catch (error) {
            Logger.error('❌ Error en verificarAntilink2:', error);
            return false;
        }
    }

    // Limpieza periódica (solo cache de grupos)
    limpiarCachePeriodico() {
        const ahora = Date.now();
        let eliminados = 0;
        const cacheTime = 300000; // 5 minutos para cache de grupos

        // Limpiar cache de grupos
        for (const [clave, datos] of Object.entries(this.cacheGrupos)) {
            if (ahora - datos.timestamp > cacheTime) {
                delete this.cacheGrupos[clave];
                eliminados++;
            }
        }
        
        // Se elimina la limpieza de advertencias de usuarios

        if (eliminados > 0) {
            Logger.debug(`🧹 Antilink2: ${eliminados} entradas de cache limpiadas`);
        }
    }

    inicializarLimpiezaPeriodica() {
        setInterval(() => {
            this.limpiarCachePeriodico();
        }, 300000); // Cada 5 minutos
    }

    // Método para que los comandos limpien el cache cuando cambien configuración
    async actualizarConfiguracion(jid, config, valor) {
        try {
            if (!this.gestorGrupos) {
                await this.inicializarGestorGrupos();
                if (!this.gestorGrupos) return false;
            }

            const resultado = await this.gestorGrupos.actualizarConfiguracion(jid, config, valor);
            
            // LIMPIAR CACHE cuando se cambia configuración
            if (resultado && config === 'antilink2') {
                this.limpiarCacheGrupo(jid);
                Logger.info(`🔄 Cache actualizado para ${jid}: antilink2 = ${valor}`);
            }
            
            return resultado;
        } catch (error) {
            Logger.error('Error actualizando configuración:', error);
            return false;
        }
    }

    // Estadísticas simplificadas
    obtenerEstadisticas() {
        return {
            cacheGrupos: Object.keys(this.cacheGrupos).length,
            estado: this.gestorGrupos ? 'activo' : 'inactivo'
        };
    }
}

module.exports = ManejadorAntilink2;