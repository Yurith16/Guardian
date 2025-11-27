const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Función para convertir audio/video a MP3
function toAudio(buffer, ext = 'mp4') {
  return new Promise(async (resolve, reject) => {
    try {
      const tmpDir = path.join(__dirname, '../../tmp');
      await fs.mkdir(tmpDir, { recursive: true });

      const tmp = path.join(tmpDir, `${Date.now()}.${ext}`);
      const out = path.join(tmpDir, `${Date.now()}.mp3`);

      await fs.writeFile(tmp, buffer);

      spawn('ffmpeg', [
        '-y',
        '-i', tmp,
        '-vn',
        '-acodec', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        out
      ])
      .on('error', reject)
      .on('close', async (code) => {
        try {
          await fs.unlink(tmp);
          if (code !== 0) {
            await fs.unlink(out).catch(() => {});
            return reject(new Error(`FFmpeg exited with code ${code}`));
          }

          const data = await fs.readFile(out);
          await fs.unlink(out);

          resolve({
            data: data,
            filename: out,
            delete: () => fs.unlink(out).catch(() => {})
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
    command: ['tomp3', 'toaudio', 'mp3'],
    description: 'Convertir video/audio a MP3',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await sock.sendMessage(jid, {
                    text: '❌ *Responde a un video o audio*'
                }, { quoted: message });
                return;
            }

            const mime = quoted.videoMessage?.mimetype || quoted.audioMessage?.mimetype || '';
            if (!mime.includes('video') && !mime.includes('audio')) {
                await sock.sendMessage(jid, {
                    text: '❌ *Solo puedes convertir videos o audios*'
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Descargar el media
            const mediaType = quoted.videoMessage ? 'video' : 'audio';
            const mediaStream = await downloadContentFromMessage(quoted[`${mediaType}Message`], mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of mediaStream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer || buffer.length === 0) {
                throw new Error('Error al descargar el archivo');
            }

            await sock.sendMessage(jid, {
                react: { text: "🔧", key: message.key }
            });

            let audioResult;
            const ext = mime.includes('video') ? 'mp4' : 'm4a';

            try {
                // Intentar con FFmpeg
                audioResult = await toAudio(buffer, ext);
            } catch (ffmpegError) {
                console.log('FFmpeg falló, enviando audio original:', ffmpegError.message);
                // Si FFmpeg falla, enviar el audio/video original
                audioResult = {
                    data: buffer,
                    filename: `audio_${Date.now()}.${mime.includes('video') ? 'mp4' : 'm4a'}`,
                    delete: () => Promise.resolve() // Función vacía para evitar errores
                };
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Enviar audio convertido
            await sock.sendMessage(jid, {
                audio: audioResult.data,
                mimetype: 'audio/mpeg',
                fileName: `audio_${Date.now()}.mp3`
            });

            // Limpiar archivo temporal (solo si existe la función delete)
            if (audioResult.delete && typeof audioResult.delete === 'function') {
                audioResult.delete().catch(() => {});
            }

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando tomp3:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo convertir a MP3*'
            }, { quoted: message });
        }
    }
};