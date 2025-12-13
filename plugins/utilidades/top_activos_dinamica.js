const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');

module.exports = {
    command: ['topactivos', 'toparchivos', 'ranking'],
    description: 'Ver top de usuarios más activos (Solo Admins)',
    isOwner: false,
    isGroup: true,
    isPrivate: false,
    isAdmin: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si es admin
            const groupMetadata = await sock.groupMetadata(jid);
            const participant = groupMetadata.participants.find(p => p.id === sender);

            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Solo administradores*\nEste comando es exclusivo para admins del grupo.' 
                }, { quoted: message });
            }

            let gestorGrupos = null;

            if (sock.guardianBot) {
                gestorGrupos = sock.guardianBot.obtenerGestorGrupos();
            } else if (global.botInstance) {
                gestorGrupos = global.botInstance.obtenerGestorGrupos();
            }

            if (!gestorGrupos) {
                Logger.error('❌ No se pudo obtener gestor de grupos');
                return await sock.sendMessage(jid, { 
                    text: '❌ El sistema de estadísticas no está disponible.' 
                }, { quoted: message });
            }

            // Obtener el ranking de usuarios con archivos
            const topUsuarios = await gestorGrupos.obtenerTopActivos(jid, 15);

            if (!topUsuarios || topUsuarios.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '📭 *No hay datos de actividad*\n\nLos usuarios aún no han enviado archivos.' 
                }, { quoted: message });
            }

            // Filtrar usuarios que realmente tienen archivos (por si acaso)
            const usuariosConArchivos = topUsuarios.filter(usuario => 
                usuario.total_archivos > 0
            );

            if (usuariosConArchivos.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '📭 *No hay usuarios con archivos*\n\nNingún usuario ha enviado archivos todavía.\n\nEnvía algunos archivos primero y vuelve a intentar.' 
                }, { quoted: message });
            }

            // ✅ DISEÑO MEJORADO
            let topTexto = `🏆 *TOP ${Math.min(usuariosConArchivos.length, 10)} CON ARCHIVOS*\n`;
            topTexto += `📌 Grupo: ${groupMetadata.subject || 'Sin nombre'}\n`;
            topTexto += `👥 Total usuarios: ${groupMetadata.participants?.length || 0}\n`;
            topTexto += `📊 Con archivos: ${usuariosConArchivos.length}\n`;
            topTexto += `═══════════════════════════\n\n`;

            const medallas = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

            // Mostrar máximo 10 usuarios
            const usuariosAMostrar = usuariosConArchivos.slice(0, 10);

            usuariosAMostrar.forEach((usuario, index) => {
                const medalla = medallas[index] || `${index + 1}⃣`;
                const adminBadge = usuario.es_admin ? ' 👑' : '';

                topTexto += `${medalla} @${usuario.numero}${adminBadge}\n`;
                topTexto += `   📁 Total archivos: ${usuario.total_archivos}\n`;

                // Desglose por tipo - solo mostrar tipos con archivos
                const detalles = [];

                if (usuario.archivos?.imagenes > 0) 
                    detalles.push(`📸${usuario.archivos.imagenes}`);
                if (usuario.archivos?.videos > 0) 
                    detalles.push(`🎥${usuario.archivos.videos}`);
                if (usuario.archivos?.audios > 0) 
                    detalles.push(`🎵${usuario.archivos.audios}`);
                if (usuario.archivos?.documentos > 0) 
                    detalles.push(`📄${usuario.archivos.documentos}`);
                if (usuario.archivos?.stickers > 0) 
                    detalles.push(`🎨${usuario.archivos.stickers}`);
                if (usuario.archivos?.otros > 0) 
                    detalles.push(`📦${usuario.archivos.otros}`);

                if (detalles.length > 0) {
                    topTexto += `   ${detalles.join(' ')}\n`;
                }

                // Separador entre usuarios
                if (index < usuariosAMostrar.length - 1) {
                    topTexto += `   ──────────────\n`;
                }
                topTexto += `\n`;
            });

            // Calcular totales
            const totalArchivos = usuariosConArchivos.reduce((sum, user) => sum + user.total_archivos, 0);
            const promedioPorUsuario = usuariosConArchivos.length > 0 ? 
                Math.round(totalArchivos / usuariosConArchivos.length) : 0;

            topTexto += `═══════════════════════════\n`;
            topTexto += `📈 *ESTADÍSTICAS GENERALES*\n`;
            topTexto += `• Total archivos: ${totalArchivos}\n`;
            topTexto += `• Promedio por usuario: ${promedioPorUsuario}\n`;
            topTexto += `• Usuario líder: @${usuariosConArchivos[0]?.numero || 'Ninguno'}\n`;
            topTexto += `═══════════════════════════\n`;
            topTexto += `📅 Actualizado: ${new Date().toLocaleDateString('es-ES', { 
                day: '2-digit', 
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })}`;

            // Preparar menciones
            const mentions = usuariosAMostrar
                .filter(user => user.usuario_id)
                .map(user => user.usuario_id);

            await sock.sendMessage(jid, { 
                text: topTexto,
                mentions: mentions.length > 0 ? mentions : undefined
            }, { quoted: message });

            Logger.info(`✅ Ranking generado: ${usuariosAMostrar.length} usuarios con ${totalArchivos} archivos`);

        } catch (error) {
            Logger.error('❌ Error en comando ranking:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al generar el ranking. Verifica que el bot tenga acceso a las estadísticas.' 
            }, { quoted: message });
        }
    }
};