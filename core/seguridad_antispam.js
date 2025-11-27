const Logger = require('../utils/logger');

class ManejadorAntispam {
    constructor() {
        this.contadorMensajes = new Map(); // { jid_user: { count: number, timestamp: number } }
        this.usuariosBaneados = new Map(); // { jid_user: baneadoHasta }
        this.spamDetectado = new Map(); // { jid: boolean }
    }

    // Verificar si un usuario está baneado temporalmente
    estaUsuarioBaneado(jid, usuario) {
        const clave = `${jid}_${usuario}`;
        const baneadoHasta = this.usuariosBaneados.get(clave);

        if (baneadoHasta && Date.now() < baneadoHasta) {
            return true;
        }

        // Limpiar si el baneo expiró
        if (baneadoHasta && Date.now() >= baneadoHasta) {
            this.usuariosBaneados.delete(clave);
        }

        return false;
    }

    // Banear usuario temporalmente (5 minutos)
    banearUsuario(jid, usuario) {
        const clave = `${jid}_${usuario}`;
        const baneadoHasta = Date.now() + (5 * 60 * 1000); // 5 minutos
        this.usuariosBaneados.set(clave, baneadoHasta);

        Logger.info(`🚫 Usuario baneado por spam: ${usuario} en ${jid} hasta ${new Date(baneadoHasta).toLocaleTimeString()}`);

        // Limpiar después de 5 minutos
        setTimeout(() => {
            this.usuariosBaneados.delete(clave);
            Logger.info(`✅ Baneo expirado para: ${usuario} en ${jid}`);
        }, 5 * 60 * 1000);
    }

    // Contar mensajes y detectar spam
    contarMensaje(jid, usuario) {
        const clave = `${jid}_${usuario}`;
        const ahora = Date.now();
        const limiteTiempo = 3000; // 3 segundos
        const limiteMensajes = 10; // 10 mensajes

        const datos = this.contadorMensajes.get(clave) || { count: 0, timestamp: ahora };

        // Reiniciar contador si pasó el tiempo límite
        if (ahora - datos.timestamp > limiteTiempo) {
            datos.count = 1;
            datos.timestamp = ahora;
        } else {
            datos.count++;
        }

        this.contadorMensajes.set(clave, datos);

        // Verificar si superó el límite
        if (datos.count >= limiteMensajes) {
            Logger.warn(`🚨 SPAM DETECTADO: ${usuario} en ${jid} - ${datos.count} mensajes en 3 segundos`);
            this.contadorMensajes.delete(clave); // Resetear contador
            return true;
        }

        return false;
    }

    // Procesar spam detectado
    async procesarSpam(sock, jid, usuario, mensajesSpam = []) {
        try {
            // Marcar que se detectó spam en este grupo
            this.spamDetectado.set(jid, true);

            // 1. Cerrar el grupo inmediatamente
            await sock.groupSettingUpdate(jid, 'announcement');

            // 2. Banear al usuario por 5 minutos
            this.banearUsuario(jid, usuario);

            // 3. Eliminar todos los mensajes spam si se proporcionan
            if (mensajesSpam.length > 0) {
                for (const mensaje of mensajesSpam) {
                    try {
                        await sock.sendMessage(jid, { delete: mensaje.key });
                    } catch (error) {
                        Logger.debug(`No se pudo eliminar mensaje spam: ${error.message}`);
                    }
                }
                Logger.info(`✅ ${mensajesSpam.length} mensajes spam eliminados de ${usuario}`);
            }

            // 4. Enviar mensaje de alerta
            await sock.sendMessage(jid, {
                text: `🚨 *SPAM MASIVO DETECTADO*\n\n` +
                      `👤 *Usuario:* @${usuario.split('@')[0]}\n` +
                      `⏰ *Acción:* Grupo cerrado por seguridad\n` +
                      `🛡️ *Protección:* Se reabrirá en 2 minutos\n\n` +
                      `⚠️ El usuario ha sido baneado temporalmente`,
                mentions: [usuario]
            });

            Logger.info(`🚨 Grupo ${jid} cerrado por spam de ${usuario}`);

            // 5. Reabrir grupo después de 2 minutos
            setTimeout(async () => {
                try {
                    await sock.groupSettingUpdate(jid, 'not_announcement');
                    await sock.sendMessage(jid, {
                        text: `🔓 *GRUPO REABIERTO*\n\n` +
                              `✅ El grupo ha sido reabierto después del incidente de spam\n` +
                              `🛡️ Sistema antispam activado`
                    });
                    this.spamDetectado.delete(jid);
                    Logger.info(`✅ Grupo ${jid} reabierto después de spam`);
                } catch (error) {
                    Logger.error(`Error reabriendo grupo: ${error.message}`);
                }
            }, 2 * 60 * 1000); // 2 minutos

            return true;

        } catch (error) {
            Logger.error(`Error procesando spam: ${error.message}`);
            return false;
        }
    }

    // Verificar y manejar mensajes de usuarios baneados
    async verificarUsuarioBaneado(sock, mensaje) {
        const jid = mensaje.key.remoteJid;
        const usuario = mensaje.key.participant || mensaje.key.remoteJid;

        if (this.estaUsuarioBaneado(jid, usuario)) {
            try {
                // Eliminar mensaje del usuario baneado
                await sock.sendMessage(jid, { delete: mensaje.key });
                Logger.info(`🗑️ Mensaje eliminado de usuario baneado: ${usuario}`);

                // Opcional: Enviar advertencia (solo una vez)
                const clave = `advertencia_${jid}_${usuario}`;
                if (!this.usuariosBaneados.get(clave)) {
                    await sock.sendMessage(jid, {
                        text: `⚠️ @${usuario.split('@')[0]} estás baneado temporalmente por spam.\n` +
                              `⏰ El baneo expira en unos minutos.`,
                        mentions: [usuario]
                    });
                    this.usuariosBaneados.set(clave, true);
                    setTimeout(() => this.usuariosBaneados.delete(clave), 60000); // Limpiar después de 1 minuto
                }

                return true;
            } catch (error) {
                Logger.debug(`Error eliminando mensaje de usuario baneado: ${error.message}`);
            }
        }

        return false;
    }

    // Obtener configuración del grupo (necesita gestorGrupos)
    async obtenerConfiguracionAntispam(jid) {
        try {
            const bot = require('../main');
            const gestorComandos = bot.obtenerGestorComandos();
            const gestorGrupos = gestorComandos.obtenerGestorGrupos();

            if (!gestorGrupos) return true; // Por defecto activado

            const datosGrupo = await gestorGrupos.obtenerDatos(jid);
            return datosGrupo?.configuraciones?.antispam !== false;

        } catch (error) {
            Logger.debug('Error obteniendo configuración antispam:', error.message);
            return true; // Por defecto activado
        }
    }

    // Limpiar datos antiguos
    limpiarDatosAntiguos() {
        const ahora = Date.now();
        const unaHora = 60 * 60 * 1000;

        // Limpiar contadores antiguos
        for (const [clave, datos] of this.contadorMensajes.entries()) {
            if (ahora - datos.timestamp > unaHora) {
                this.contadorMensajes.delete(clave);
            }
        }
    }

    // Método principal para verificar spam
    async verificarSpam(sock, mensaje) {
        try {
            const jid = mensaje.key.remoteJid;
            const usuario = mensaje.key.participant || mensaje.key.remoteJid;

            // Solo verificar en grupos
            if (!jid.endsWith('@g.us')) return false;

            // Verificar si el antispam está activado
            const antispamActivo = await this.obtenerConfiguracionAntispam(jid);
            if (!antispamActivo) return false;

            // 1. Verificar si el usuario está baneado
            if (await this.verificarUsuarioBaneado(sock, mensaje)) {
                return true;
            }

            // 2. Contar mensaje para detección de spam
            if (this.contarMensaje(jid, usuario)) {
                // Spam detectado - procesar
                await this.procesarSpam(sock, jid, usuario);
                return true;
            }

            return false;

        } catch (error) {
            Logger.error('Error en verificarSpam:', error);
            return false;
        }
    }

    // Obtener estadísticas (para debugging)
    obtenerEstadisticas() {
        return {
            contadoresActivos: this.contadorMensajes.size,
            usuariosBaneados: this.usuariosBaneados.size,
            gruposConSpam: this.spamDetectado.size
        };
    }
}

module.exports = ManejadorAntispam;