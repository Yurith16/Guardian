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
            const gestorGrupos = sock.guardianBot?.gestorComandos?.obtenerGestorGrupos();
            if (!gestorGrupos) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El sistema de archivos no está disponible.' 
                }, { quoted: message });
            }

            const perfil = await gestorGrupos.obtenerPerfilUsuario(jid, sender);

            if (!perfil) {
                return await sock.sendMessage(jid, { 
                    text: '📭 Aún no has compartido archivos en este grupo.' 
                }, { quoted: message });
            }

            const username = `@${sender.split('@')[0]}`;
            const fechaUltimo = new Date(perfil.ultimo_archivo).toLocaleDateString('es-ES');

            let perfilTexto = `╭━━〔 👤 PERFIL DE ${username} 〕━━╮\n`;
            perfilTexto += `┃ 📊 Total de archivos: ${perfil.total_archivos}\n`;
            perfilTexto += `┃ 🎨 Stickers hoy: ${perfil.stickers_hoy}/10\n`;
            perfilTexto += `┃ ⏰ Último archivo: ${fechaUltimo}\n`;
            perfilTexto += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;

            perfilTexto += `╭━━〔 📁 DETALLE POR TIPO 〕━━╮\n`;
            perfilTexto += `┃ 📸 Imágenes: ${perfil.archivos.imagenes}\n`;
            perfilTexto += `┃ 🎥 Videos: ${perfil.archivos.videos}\n`;
            perfilTexto += `┃ 🎵 Audios: ${perfil.archivos.audios}\n`;
            perfilTexto += `┃ 📄 Documentos: ${perfil.archivos.documentos}\n`;
            perfilTexto += `┃ 🎨 Stickers: ${perfil.archivos.stickers}\n`;
            perfilTexto += `┃ 📦 Otros: ${perfil.archivos.otros}\n`;
            perfilTexto += `╰━━━━━━━━━━━━━━━━━━━━╯`;

            await sock.sendMessage(jid, { 
                text: perfilTexto,
                mentions: [sender]
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en comando miperfil:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener tu perfil.' 
            }, { quoted: message });
        }
    }
};