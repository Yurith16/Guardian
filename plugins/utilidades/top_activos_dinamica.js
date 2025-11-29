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
                    text: '⛔ Solo los administradores pueden usar este comando.' 
                }, { quoted: message });
            }

            const gestorGrupos = sock.guardianBot?.gestorComandos?.obtenerGestorGrupos();
            if (!gestorGrupos) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El sistema de archivos no está disponible.' 
                }, { quoted: message });
            }

            const topUsuarios = await gestorGrupos.obtenerTopActivos(jid, 15);

            if (topUsuarios.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '📭 No hay datos de archivos en este grupo.' 
                }, { quoted: message });
            }

            let topTexto = `╭━━〔 🏆 TOP ACTIVOS - ${groupMetadata.subject} 〕━━╮\n`;

            topUsuarios.forEach((usuario, index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ` ${index + 1}️⃣`;
                const adminBadge = usuario.es_admin ? ' ⚡' : '';
                topTexto += `┃${emoji} @${usuario.numero}${adminBadge}\n`;
                topTexto += `┃   📊 Total: ${usuario.total_archivos} archivos\n`;

                if (usuario.total_archivos > 0) {
                    topTexto += `┃   📸${usuario.archivos.imagenes} 🎥${usuario.archivos.videos} 🎵${usuario.archivos.audios}\n`;
                    topTexto += `┃   📄${usuario.archivos.documentos} 🎨${usuario.archivos.stickers} 📦${usuario.archivos.otros}\n`;
                }

                topTexto += `┃\n`;
            });

            topTexto += `╰━━━━━━━━━━━━━━━━━━━━╯`;

            const mentions = topUsuarios.map(user => user.usuario_id);

            await sock.sendMessage(jid, { 
                text: topTexto,
                mentions: mentions
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en comando topactivos:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener el ranking.' 
            }, { quoted: message });
        }
    }
};