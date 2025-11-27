const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = {
    command: ['togif', 'togifaud', 'videogif'],
    description: 'Convertir video a GIF con audio',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await sock.sendMessage(jid, {
                    text: '❌ *Responde a un video*'
                }, { quoted: message });
                return;
            }

            // Verificar si es un video
            const mime = quoted.videoMessage?.mimetype || '';
            if (!mime.includes('mp4') && !mime.includes('video')) {
                await sock.sendMessage(jid, {
                    text: '❌ *Solo puedes convertir videos*'
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Descargar el video
            const stream = await downloadContentFromMessage(quoted.videoMessage, "video");
            let buffer = Buffer.from([]);

            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('Error al procesar el video');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Enviar como GIF con audio
            await sock.sendMessage(jid, {
                video: buffer,
                gifPlayback: true,
                caption: '🎬 *GIF creado*'
            });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando togifaud:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo convertir*'
            }, { quoted: message });
        }
    }
};