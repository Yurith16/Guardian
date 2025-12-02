const yts = require("yt-search");

const Logger = require('../../utils/logger');

const userRequests = {};

module.exports = {
    command: ['yts', 'ytsearch', 'ytsearchs', 'buscar', 'busca'],
    description: 'Buscar videos en YouTube',
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const userId = message.key.participant || jid;
        const userNumber = userId.split("@")[0];
        const text = args.join(" ");
        const sender = message.key.participant || jid;
        const senderKey = sender.split("@")[0];

        if (!text) {
            await sock.sendMessage(
                jid,
                {
                    text: `❌ Ingresa texto para buscar\n💡 Ejemplo: .yts shakira`,
                },
                { quoted: message }
            );
            return;
        }

        if (userRequests[senderKey]) {
            await sock.sendMessage(
                jid,
                {
                    text: `⏳ Ya tienes una búsqueda en proceso`,
                },
                { quoted: message }
            );
            return;
        }

        userRequests[senderKey] = true;

        try {
            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key },
            });

            const results = await yts(text);

            if (!results || !results.videos || results.videos.length === 0) {
                throw new Error("No se encontraron videos");
            }

            const videos = results.videos.slice(0, 10);

            let resultText =
                ` *「✦」 RESULTADOS DE YOUTUBE*\n\n` +
                `> ✦ *Búsqueda:* » ${text}\n` +
                `> ⴵ *Resultados:* » ${videos.length} videos\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            videos.forEach((video, index) => {
                const number = (index + 1).toString().padStart(2, "0");

                resultText +=
                    ` *「${number}」 ${video.title}*\n\n` +
                    `> ✦ *Canal:* » ${video.author?.name || "Canal desconocido"}\n` +
                    `> ⴵ *Duración:* » ${video.timestamp || "00:00"}\n` +
                    `> ✰ *Vistas:* » ${video.views?.toLocaleString() || "N/A"}\n` +
                    `> 📅 *Publicado:* » ${video.ago || "N/A"}\n` +
                    `> 🔗 *Enlace:* » ${video.url}\n` +
                    `> ⚡ *GUARDIAN BOT*\n\n`;

                if (index < videos.length - 1) {
                    resultText += `────────────────────────────\n\n`;
                }
            });

            resultText +=
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `⚡ *GUARDIAN BOT*`;

            // ✅ USAR THUMBNAIL DEL PRIMER VIDEO O IMAGEN POR DEFECTO
            const thumbnailUrl = videos[0]?.thumbnail || 
                               `https://img.youtube.com/vi/${videos[0]?.videoId || 'dQw4w9WgXcQ'}/maxresdefault.jpg`;

            await sock.sendMessage(
                jid,
                {
                    image: { url: thumbnailUrl },
                    caption: resultText,
                },
                { quoted: message }
            );

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key },
            });

            Logger.info(`✅ Búsqueda YouTube: "${text}" - ${videos.length} resultados`);

        } catch (error) {
            Logger.error('Error en YouTube search:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key },
            });

            await sock.sendMessage(
                jid,
                {
                    text: ` *「✦」 ERROR EN BÚSQUEDA*\n\n` +
                          `> ✦ *Búsqueda:* » ${text}\n` +
                          `> ⴵ *Estado:* » No se encontraron resultados\n` +
                          `> 💡 *Sugerencia:* » Intenta con otras palabras\n` +
                          `> ⚡ *GUARDIAN BOT*`
                },
                { quoted: message }
            );

        } finally {
            delete userRequests[senderKey];
        }
    }
};