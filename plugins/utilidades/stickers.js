const fs = require('fs');
const path = require('path');
const Crypto = require('crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

const tempFolder = path.join(__dirname, '../../tmp/');
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

module.exports = {
    command: ['s', 'sticker'],
    description: 'Guardian',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await sock.sendMessage(jid, {
                    react: { text: "❌", key: message.key }
                });
                return await sock.sendMessage(jid, {
                    text: `❌ *Responde a una imagen*\n\nUso: Responde a una imagen con:\n*s\n*sticker`
                }, { quoted: message });
            }

            const mediaType = quoted.imageMessage ? 'image' : null;
            if (!mediaType) {
                await sock.sendMessage(jid, {
                    react: { text: "❌", key: message.key }
                });
                return await sock.sendMessage(jid, {
                    text: `❌ *Solo puedes convertir imágenes en stickers*`
                }, { quoted: message });
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            const mediaStream = await downloadContentFromMessage(quoted.imageMessage, 'image');
            let buffer = Buffer.alloc(0);
            for await (const chunk of mediaStream) buffer = Buffer.concat([buffer, chunk]);

            // Convertir a WebP usando Sharp (sin FFmpeg)
            const webpBuffer = await sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({ quality: 90 })
                .toBuffer();

            await sock.sendMessage(jid, {
                sticker: webpBuffer
            });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            console.log('✅ Sticker creado exitosamente');

        } catch (err) {
            console.error('❌ Error en el comando de sticker:', err);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: `❌ *Error al crear el sticker*`
            }, { quoted: message });
        }
    }
};