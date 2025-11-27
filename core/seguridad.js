const Logger = require('../utils/logger');

class ManejadorSeguridad {
    constructor() {
        this.spamCount = new Map();
        // SOLO estos dominios están PERMITIDOS
        this.dominiosPermitidos = [
            'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
            'facebook.com', 'fb.com', 
            'instagram.com',
            'youtube.com', 'youtu.be',
            'twitter.com', 'x.com',
            'mediafire.com'
        ];
    }

    obtenerTextoMensaje(mensaje) {
        if (mensaje.message?.conversation) return mensaje.message.conversation;
        if (mensaje.message?.extendedTextMessage?.text) return mensaje.message.extendedTextMessage.text;
        if (mensaje.message?.imageMessage?.caption) return mensaje.message.imageMessage.caption;
        if (mensaje.message?.videoMessage?.caption) return mensaje.message.videoMessage.caption;
        return '';
    }

    contieneEnlacesNoPermitidos(texto) {
        if (!texto || typeof texto !== 'string') return false;

        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.[a-z]{2,}(\/[^\s]*)?)/gi;
        const enlaces = texto.match(urlRegex);
        if (!enlaces) return false;

        for (const enlace of enlaces) {
            try {
                let dominio = enlace.toLowerCase();

                // Normalizar dominio
                if (dominio.includes('://')) {
                    const url = new URL(dominio.includes('http') ? dominio : 'https://' + dominio);
                    dominio = url.hostname;
                } else if (dominio.startsWith('www.')) {
                    dominio = dominio.replace('www.', '');
                }

                dominio = dominio.split('/')[0];

                // Verificar si el dominio NO está en la lista de permitidos
                const esPermitido = this.dominiosPermitidos.some(perm => dominio.includes(perm));
                if (!esPermitido && dominio.includes('.') && dominio.length > 3) {
                    Logger.info(`🚫 Enlace bloqueado: ${dominio}`);
                    return true; // Enlace NO permitido encontrado
                }
            } catch (error) {
                continue;
            }
        }
        return false;
    }

    async verificarAntilink(sock, mensaje, jid, texto) {
        try {
            // Obtener gestor de grupos
            let gestorGrupos;
            try {
                const bot = require('../main');
                gestorGrupos = bot.gestorComandos?.gestorGrupos;
            } catch (error) {
                Logger.debug('No se pudo obtener gestor de grupos:', error.message);
                return;
            }

            if (!gestorGrupos) {
                Logger.debug('Gestor de grupos no disponible');
                return;
            }

            // Obtener configuración del grupo
            let datosGrupo;
            try {
                datosGrupo = await gestorGrupos.obtenerDatos(jid);
            } catch (error) {
                Logger.debug('No se pudieron obtener datos del grupo:', error.message);
                return;
            }

            if (!datosGrupo) {
                Logger.debug(`No hay datos para el grupo: ${jid}`);
                return;
            }

            // Verificar si antilink está activo
            const antilinkActivo = datosGrupo.configuraciones?.antilink === true;
            if (!antilinkActivo) {
                Logger.debug(`Antilink desactivado para: ${jid}`);
                return;
            }

            Logger.info(`🔍 Verificando enlaces en mensaje de ${jid}`);

            // Verificar enlaces no permitidos
            if (this.contieneEnlacesNoPermitidos(texto)) {
                const usuario = mensaje.key.participant || mensaje.key.remoteJid;

                Logger.info(`🚫 Enlace no permitido detectado: ${usuario} en ${jid} - Texto: ${texto}`);

                // Verificar si es administrador
                try {
                    const metadata = await sock.groupMetadata(jid);
                    const participant = metadata.participants.find(p => p.id === usuario);
                    const esAdmin = participant && ['admin', 'superadmin'].includes(participant.admin);

                    if (esAdmin) {
                        Logger.info(`⚡ Admin detectado, ignorando antilink: ${usuario}`);
                        return;
                    }
                } catch (error) {
                    Logger.debug('Error verificando admin:', error.message);
                }

                // ELIMINAR MENSAJE inmediatamente
                try {
                    await sock.sendMessage(jid, { delete: mensaje.key });
                    Logger.info(`✅ Mensaje con enlace eliminado: ${usuario}`);
                } catch (error) {
                    Logger.debug('No se pudo eliminar mensaje:', error.message);
                }

                // ELIMINAR USUARIO inmediatamente
                try {
                    await sock.groupParticipantsUpdate(jid, [usuario], 'remove');
                    Logger.info(`✅ Usuario eliminado por enlace no permitido: ${usuario}`);

                    // Mensaje de acción tomada
                    await sock.sendMessage(jid, { 
                        text: `🚫 Usuario eliminado por enviar enlaces no permitidos\n\n✅ Dominios permitidos:\n• TikTok, Facebook, Instagram\n• YouTube, Twitter, MediaFire` 
                    });
                } catch (error) {
                    Logger.debug('No se pudo eliminar usuario:', error.message);
                }
            } else {
                Logger.debug(`✅ Mensaje sin enlaces no permitidos: ${jid}`);
            }
        } catch (error) {
            Logger.error('Error en verificarAntilink:', error);
        }
    }

    // Método para obtener lista de dominios permitidos
    obtenerDominiosPermitidos() {
        return [...this.dominiosPermitidos];
    }
}

module.exports = ManejadorSeguridad;