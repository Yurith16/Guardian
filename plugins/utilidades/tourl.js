const axios = require('axios');
const FormData = require('form-data');
const { fileTypeFromBuffer } = require('file-type');

// Función para subir archivos a Catbox
async function uploadToCatbox(buffer) {
  try {
    const { ext, mime } = await fileTypeFromBuffer(buffer);
    const form = new FormData();

    form.append('fileToUpload', buffer, {
      filename: `file.${ext}`,
      contentType: mime
    });
    form.append('reqtype', 'fileupload');

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000
    });

    if (response.data.startsWith('https://files.catbox.moe/')) {
      return response.data;
    } else {
      throw new Error('Error al subir el archivo');
    }
  } catch (error) {
    throw new Error(`Error en Catbox: ${error.message}`);
  }
}

// Función alternativa para subir archivos
async function uploadToFileIO(buffer) {
  try {
    const form = new FormData();
    form.append('file', buffer, {
      filename: 'file',
      contentType: 'application/octet-stream'
    });

    const response = await axios.post('https://file.io', form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000
    });

    if (response.data.success) {
      return response.data.link;
    } else {
      throw new Error('Error al subir el archivo');
    }
  } catch (error) {
    throw new Error(`Error en File.io: ${error.message}`);
  }
}

module.exports = {
    command: ['tourl', 'upload', 'uploader'],
    description: 'Subir archivos y obtener URL',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await sock.sendMessage(jid, {
                    text: '❌ *Responde a un archivo, imagen o video*'
                }, { quoted: message });
                return;
            }

            // Detectar tipo de medio
            let mediaType, mediaMessage;
            if (quoted.imageMessage) {
                mediaType = 'image';
                mediaMessage = quoted.imageMessage;
            } else if (quoted.videoMessage) {
                mediaType = 'video';
                mediaMessage = quoted.videoMessage;
            } else if (quoted.audioMessage) {
                mediaType = 'audio';
                mediaMessage = quoted.audioMessage;
            } else if (quoted.documentMessage) {
                mediaType = 'document';
                mediaMessage = quoted.documentMessage;
            } else {
                await sock.sendMessage(jid, {
                    text: '❌ *Tipo de archivo no soportado*'
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Descargar el archivo
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const mediaStream = await downloadContentFromMessage(mediaMessage, mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of mediaStream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer || buffer.length === 0) {
                throw new Error('Error al descargar el archivo');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            let fileUrl;

            // Intentar con Catbox primero
            try {
                fileUrl = await uploadToCatbox(buffer);
            } catch (error) {
                console.log('Catbox falló, intentando con File.io:', error.message);
                // Intentar con File.io como respaldo
                fileUrl = await uploadToFileIO(buffer);
            }

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            // Enviar la URL
            await sock.sendMessage(jid, {
                text: `🔗 *URL del archivo:*\n${fileUrl}`
            }, { quoted: message });

        } catch (error) {
            console.error('Error en comando tourl:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo subir el archivo*'
            }, { quoted: message });
        }
    }
};