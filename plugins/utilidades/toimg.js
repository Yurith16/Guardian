const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = {
    command: ['toimg', 'stickerimg', 'toimage'],
    description: 'Convertir sticker a imagen',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted || !quoted.stickerMessage) {
                await sock.sendMessage(jid, {
                    text: '❌ *Responde a un sticker*'
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Descargar el sticker
            const stream = await downloadContentFromMessage(quoted.stickerMessage, "sticker");
            let buffer = Buffer.from([]);

            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('Error al procesar el sticker');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Enviar imagen convertida
            await sock.sendMessage(jid, {
                image: buffer,
                caption: '✅ *Conversión exitosa*'
            });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando toimg:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo convertir*'
            }, { quoted: message });
        }
    }
};