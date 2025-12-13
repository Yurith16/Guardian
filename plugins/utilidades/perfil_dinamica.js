const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');

module.exports = {
    command: ['miperfil', 'perfil', 'misdatos'],
    description: 'Ver mi perfil de archivos en el grupo',
    isOwner: false,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Obtener el gestor de grupos
            let gestorGrupos = null;

            if (sock.guardianBot) {
                gestorGrupos = sock.guardianBot.obtenerGestorGrupos();
            } else if (global.botInstance) {
                gestorGrupos = global.botInstance.obtenerGestorGrupos();
            } else if (sock.guardianBot?.gestorComandos) {
                gestorGrupos = sock.guardianBot.gestorComandos.obtenerGestorGrupos();
            }

            if (!gestorGrupos) {
                Logger.error('❌ No se pudo obtener gestor de grupos');
                return await sock.sendMessage(jid, { 
                    text: '❌ El sistema de estadísticas no está disponible.' 
                }, { quoted: message });
            }

            // Obtener perfil del usuario
            const perfil = await gestorGrupos.obtenerPerfilUsuario(jid, sender);

            if (!perfil) {
                return await sock.sendMessage(jid, { 
                    text: '📭 *Aún no tienes estadísticas*\n\nEnvía mensajes o archivos para generar tu perfil.' 
                }, { quoted: message });
            }

            const username = `@${sender.split('@')[0]}`;

            // Formatear fecha de última actividad
            let fechaUltimo = 'Nunca';
            let horaUltimo = '';

            if (perfil.ultimo_mensaje) {
                const fecha = new Date(perfil.ultimo_mensaje);
                fechaUltimo = fecha.toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                });
                horaUltimo = fecha.toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            }

            // ✅ DISEÑO SIMPLE Y LIMPIO - SOLO LO ESENCIAL
            let perfilTexto = `👤 *PERFIL DE USUARIO*\n`;
            perfilTexto += `────────────────\n`;
            perfilTexto += `• Usuario: ${username}\n`;
            perfilTexto += `• Rol: ${perfil.es_admin ? '👑 Administrador' : '👤 Miembro'}\n`;
            perfilTexto += `• Últ. actividad: ${fechaUltimo} ${horaUltimo ? `(${horaUltimo})` : ''}\n`;
            perfilTexto += `────────────────\n\n`;

            // Solo mostrar estadísticas de archivos si hay alguno
            if (perfil.total_archivos > 0) {
                perfilTexto += `📁 *ESTADÍSTICAS DE ARCHIVOS*\n`;
                perfilTexto += `• Total archivos: ${perfil.total_archivos}\n`;
                perfilTexto += `• Stickers hoy: ${perfil.stickers_hoy}/10\n`;
                perfilTexto += `────────────────\n\n`;

                // Desglose detallado de archivos
                perfilTexto += `📊 *DESGLOSE POR TIPO*\n`;

                // Crear un array con todos los tipos de archivos para mostrar
                const tiposArchivos = [
                    { nombre: '📸 Imágenes', valor: perfil.archivos?.imagenes || 0, key: 'imagenes' },
                    { nombre: '🎥 Videos', valor: perfil.archivos?.videos || 0, key: 'videos' },
                    { nombre: '🎵 Audios', valor: perfil.archivos?.audios || 0, key: 'audios' },
                    { nombre: '📄 Documentos', valor: perfil.archivos?.documentos || 0, key: 'documentos' },
                    { nombre: '🎨 Stickers', valor: perfil.archivos?.stickers || 0, key: 'stickers' },
                    { nombre: '📦 Otros', valor: perfil.archivos?.otros || 0, key: 'otros' }
                ];

                // Mostrar solo los tipos que tienen al menos 1 archivo
                const tiposConArchivos = tiposArchivos.filter(tipo => tipo.valor > 0);

                if (tiposConArchivos.length > 0) {
                    tiposConArchivos.forEach((tipo, index) => {
                        const esUltimo = index === tiposConArchivos.length - 1;
                        const simbolo = esUltimo ? '└─' : '├─';
                        perfilTexto += `${simbolo} ${tipo.nombre}: ${tipo.valor}\n`;
                    });
                } else {
                    perfilTexto += `├─ No hay archivos registrados\n`;
                }

                perfilTexto += `────────────────\n\n`;

                // Información adicional sobre stickers
                if (perfil.stickers_restantes > 0 && perfil.stickers_hoy < 10) {
                    perfilTexto += `💡 *INFORMACIÓN ADICIONAL*\n`;
                    perfilTexto += `• Stickers restantes hoy: ${perfil.stickers_restantes}\n`;
                }
            } else {
                // Si no hay archivos
                perfilTexto += `📁 *ESTADÍSTICAS DE ARCHIVOS*\n`;
                perfilTexto += `• Total archivos: 0\n`;
                perfilTexto += `• Stickers hoy: 0/10\n`;
                perfilTexto += `────────────────\n\n`;
                perfilTexto += `📊 *DESGLOSE POR TIPO*\n`;
                perfilTexto += `└─ No hay archivos registrados\n`;
                perfilTexto += `────────────────\n\n`;
                perfilTexto += `💡 Envía archivos (imágenes, videos, stickers, etc.) para ver tus estadísticas.`;
            }

            // Enviar el mensaje con mención al usuario
            await sock.sendMessage(jid, { 
                text: perfilTexto,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Perfil mostrado para ${sender}`);

        } catch (error) {
            Logger.error('❌ Error en comando miperfil:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener tu perfil. Intenta nuevamente.' 
            }, { quoted: message });
        }
    }
};