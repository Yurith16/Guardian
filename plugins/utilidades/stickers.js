const fs = require('fs');
const path = require('path');
const Crypto = require('crypto');
const webp = require('node-webpmux');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

const tempFolder = path.join(__dirname, '../../tmp/');
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

module.exports = {
    command: ["s", "sticker"],
    description: "Crear stickers de imágenes/videos",
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, m) {
        const jid = m.key.remoteJid;

        try {
            const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await sock.sendMessage(jid, {
                    react: { text: "❌", key: m.key }
                });
                return await sock.sendMessage(jid, {
                    text: '❌ *Responde a una imagen o video*\n\nEjemplo: Responde con *s'
                }, { quoted: m });
            }

            const mediaType = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
            if (!mediaType) {
                await sock.sendMessage(jid, {
                    react: { text: "❌", key: m.key }
                });
                return await sock.sendMessage(jid, {
                    text: '❌ *Solo puedes convertir imágenes o videos*'
                }, { quoted: m });
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: m.key }
            });

            // Descargar el media
            const mediaStream = await downloadContentFromMessage(quoted[`${mediaType}Message`], mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of mediaStream) buffer = Buffer.concat([buffer, chunk]);

            let webpBuffer;

            if (mediaType === 'image') {
                // Convertir imagen a WebP usando Sharp
                webpBuffer = await sharp(buffer)
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({ quality: 90 })
                    .toBuffer();
            } else {
                // Para videos, enviar como GIF (sin audio)
                webpBuffer = await sharp(buffer, { animated: true })
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({ quality: 80 })
                    .toBuffer();
            }

            // Enviar sticker directamente
            await sock.sendMessage(jid, {
                sticker: webpBuffer
            }, { quoted: m });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: m.key }
            });

        } catch (err) {
            console.error('❌ Error en el comando de sticker:', err);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: m.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *Error al crear el sticker*'
            }, { quoted: m });
        }
    }
};