const yts = require("yt-search");
const axios = require("axios");
const crypto = require("crypto");

// Scraper savetube unificado
const savetube = {
   api: {
      base: "https://media.savetube.me/api",
      cdn: "/random-cdn",
      info: "/v2/info",
      download: "/download"
   },
   headers: {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://yt.savetube.me',
      'referer': 'https://yt.savetube.me/',
      'user-agent': 'Postify/1.0.0'
   },
   crypto: {
      hexToBuffer: (hexString) => {
         const matches = hexString.match(/.{1,2}/g);
         return Buffer.from(matches.join(''), 'hex');
      },
      decrypt: async (enc) => {
         try {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.crypto.hexToBuffer(secretKey);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return JSON.parse(decrypted.toString());
         } catch (error) {
            throw new Error(error)
         }
      }
   },
   youtube: url => {
      if (!url) return null;
      const a = [
         /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
         /youtu\.be\/([a-zA-Z0-9_-]{11})/
      ];
      for (let b of a) {
         if (b.test(url)) return url.match(b)[1];
      }
      return null
   },
   request: async (endpoint, data = {}, method = 'post') => {
      try {
         const { data: response } = await axios({
            method,
            url: `${endpoint.startsWith('http') ? '' : savetube.api.base}${endpoint}`,
            data: method === 'post' ? data : undefined,
            params: method === 'get' ? data : undefined,
            headers: savetube.headers,
            timeout: 30000
         })
         return {
            status: true,
            code: 200,
            data: response
         }
      } catch (error) {
         throw new Error(error)
      }
   },
   getCDN: async () => {
      const response = await savetube.request(savetube.api.cdn, {}, 'get');
      if (!response.status) throw new Error(response)
      return {
         status: true,
         code: 200,
         data: response.data.cdn
      }
   },
   downloadAudio: async (link) => {
      if (!link) {
         return {
            status: false,
            code: 400,
            error: "No link provided."
         }
      }
      const id = savetube.youtube(link);
      if (!id) throw new Error('Invalid YouTube link.');
      try {
         const cdnx = await savetube.getCDN();
         if (!cdnx.status) return cdnx;
         const cdn = cdnx.data;
         const result = await savetube.request(`https://${cdn}${savetube.api.info}`, {
            url: `https://www.youtube.com/watch?v=${id}`
         });
         if (!result.status) return result;
         const decrypted = await savetube.crypto.decrypt(result.data.data);
         let dl;
         try {
            dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
               id: id,
               downloadType: 'audio',
               quality: '128',
               key: decrypted.key
            });
         } catch (error) {
            throw new Error('Failed to get download link.');
         };
         return {
            status: true,
            code: 200,
            result: {
               title: decrypted.title || "Unknown Title",
               type: 'audio',
               format: 'mp3',
               thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/0.jpg`,
               download: dl.data.data.downloadUrl,
               id: id,
               key: decrypted.key,
               duration: decrypted.duration,
               quality: '128'
            }
         }
      } catch (error) {
         throw new Error('An error occurred while processing your request.');
      }
   },
   downloadVideo: async (link, quality = '360') => {
      if (!link) {
         return {
            status: false,
            code: 400,
            error: "No link provided."
         }
      }
      const id = savetube.youtube(link);
      if (!id) throw new Error('Invalid YouTube link.');
      try {
         const cdnx = await savetube.getCDN();
         if (!cdnx.status) return cdnx;
         const cdn = cdnx.data;
         const result = await savetube.request(`https://${cdn}${savetube.api.info}`, {
            url: `https://www.youtube.com/watch?v=${id}`
         });
         if (!result.status) return result;
         const decrypted = await savetube.crypto.decrypt(result.data.data);
         let dl;
         try {
            dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
               id: id,
               downloadType: 'video',
               quality: quality,
               key: decrypted.key
            });
         } catch (error) {
            throw new Error('Failed to get download link.');
         };
         return {
            status: true,
            code: 200,
            result: {
               title: decrypted.title || "Unknown Title",
               type: 'video',
               format: 'mp4',
               thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/0.jpg`,
               download: dl.data.data.downloadUrl,
               id: id,
               key: decrypted.key,
               duration: decrypted.duration,
               quality: quality + 'p'
            }
         }
      } catch (error) {
         throw new Error('An error occurred while processing your request.');
      }
   }
};

// Almacenamiento temporal de solicitudes
const solicitudesPendientes = new Map();

// Función para validar URLs de YouTube
function isValidYouTubeUrl(text) {
    try {
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;
        return ytRegex.test(text);
    } catch (error) {
        return false;
    }
}

// Función para extraer video ID de URL
function extractVideoId(url) {
    try {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&]+)/,
            /youtu\.be\/([^?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Función para obtener información del video
async function obtenerInformacionVideo(text) {
    const esUrl = isValidYouTubeUrl(text);

    if (esUrl) {
        // Es una URL - obtener información directa
        const videoId = extractVideoId(text);
        if (!videoId) throw new Error('URL de YouTube no válida');

        try {
            const videoInfo = await yts({ videoId: videoId });
            if (!videoInfo?.title) throw new Error('No se pudo obtener información del video');

            return {
                videoId: videoId,
                url: `https://youtu.be/${videoId}`,
                title: videoInfo.title,
                author: { name: videoInfo.author?.name || 'Desconocido' },
                duration: {
                    seconds: videoInfo.seconds || 0,
                    timestamp: videoInfo.timestamp || '00:00'
                },
                thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                views: videoInfo.views || 0,
                ago: videoInfo.ago || 'Desconocido'
            };
        } catch (error) {
            throw new Error(`Error al obtener información: ${error.message}`);
        }
    } else {
        // Es una búsqueda por texto
        try {
            const searchApi = `https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`;
            const searchResponse = await fetch(searchApi);
            const searchData = await searchResponse.json();

            if (!searchData?.data || searchData.data.length === 0) {
                throw new Error(`No se encontraron resultados para "${text}"`);
            }

            const video = searchData.data[0];
            return {
                videoId: extractVideoId(video.url) || 'unknown',
                url: video.url,
                title: video.title,
                author: { name: video.author?.name || 'Desconocido' },
                duration: {
                    timestamp: video.duration || '00:00',
                    seconds: parseDuration(video.duration) || 0
                },
                thumbnail: video.image || video.thumbnail,
                views: video.views || 0,
                ago: video.publishedAt || 'Desconocido'
            };
        } catch (error) {
            throw new Error(`Error en búsqueda: ${error.message}`);
        }
    }
}

// Función para descargar buffer
async function descargarBuffer(url) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Error al descargar: ${error.message}`);
    }
}

// Sistema de descarga de video con fallback
async function descargarVideoConFallback(videoUrl, videoDuration) {
    // Usar siempre 360p para videos largos
    let quality = videoDuration > 600 ? '360' : '480';

    // PRIMERO: Intentar con savetube
    try {
        const result = await savetube.downloadVideo(videoUrl, quality);
        if (result?.status && result?.result?.download) {
            return {
                url: result.result.download,
                quality: result.result.quality,
                source: 'savetube'
            };
        }
        throw new Error('Savetube no devolvió enlace');
    } catch (error) {
        // SEGUNDO: Intentar con API Honduras (fallback)
        try {
            const apiUrl = `https://honduras-api.onrender.com/api/ytmp4?url=${encodeURIComponent(videoUrl)}`;
            const response = await axios.get(apiUrl, { 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data?.éxito && response.data.descarga?.enlace) {
                return {
                    url: response.data.descarga.enlace,
                    quality: '360p',
                    source: 'honduras_api'
                };
            }
            throw new Error('API Honduras no devolvió enlace');
        } catch (apiError) {
            throw new Error('Todos los métodos de descarga fallaron');
        }
    }
}

// Función para procesar descarga de audio
async function procesarAudio(sock, jid, videoInfo) {
    try {
        const downloadResult = await savetube.downloadAudio(videoInfo.url);

        if (!downloadResult?.status || !downloadResult?.result?.download) {
            throw new Error('No se pudo obtener el audio');
        }

        const audioBuffer = await descargarBuffer(downloadResult.result.download);

        await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${videoInfo.title.substring(0, 64)}.mp3`
        });

        return true;
    } catch (error) {
        throw error;
    }
}

// Función para procesar descarga de video
async function procesarVideo(sock, jid, videoInfo) {
    try {
        const videoDuration = videoInfo.duration.seconds || 0;
        const downloadResult = await descargarVideoConFallback(videoInfo.url, videoDuration);

        if (!downloadResult?.url) {
            throw new Error('No se pudo obtener el video');
        }

        const videoBuffer = await descargarBuffer(downloadResult.url);

        // Siempre enviar como documento
        await sock.sendMessage(jid, {
            document: videoBuffer,
            fileName: `${videoInfo.title.substring(0, 64)}.mp4`,
            mimetype: 'video/mp4'
        });

        return true;
    } catch (error) {
        throw error;
    }
}

// Función segura para enviar reacciones
async function enviarReaccionSegura(sock, jid, messageKey, emoji) {
    try {
        await sock.sendMessage(jid, {
            react: { 
                text: emoji, 
                key: messageKey 
            }
        });
    } catch (error) {
        console.log('⚠️ Error enviando reacción:', error.message);
    }
}

module.exports = {
    command: ['play'],
    description: 'Descargar audio/video de YouTube',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa una URL de YouTube o texto para buscar*\n\nEjemplo: *play https://youtu.be/abc123*\nEjemplo: *play Shakira'
            }, { quoted: message });
            return;
        }

        try {
            await enviarReaccionSegura(sock, jid, message.key, "⏳");

            // Obtener información del video
            const video = await obtenerInformacionVideo(text);

            // Verificar duración máxima (20 minutos = 1200 segundos)
            if (video.duration.seconds > 1200) {
                await sock.sendMessage(jid, {
                    text: '❌ *El video es demasiado largo*\n\nSolo se permiten videos de hasta 20 minutos.'
                }, { quoted: message });
                return;
            }

            // Crear mensaje de información
            const infoMsg = `🎬 *${video.title}*\n\n` +
                `📺 Canal: ${video.author.name}\n` +
                `⏱️ Duración: ${video.duration.timestamp}\n` +
                `👀 Vistas: ${(video.views || 0).toLocaleString()}\n` +
                `📅 Publicado: ${video.ago || 'Desconocido'}\n` +
                `🔗 Enlace: ${video.url}\n\n` +
                `*Reacciona para descargar:*\n` +
                `👍 *Audio* (MP3)\n` +
                `❤️ *Video* (MP4 - 360p)`;

            const infoMessage = await sock.sendMessage(jid, {
                image: { url: video.thumbnail },
                caption: infoMsg
            }, { quoted: message });

            // Guardar solicitud pendiente
            const solicitudId = `${infoMessage.key.id}|${jid}`;
            solicitudesPendientes.set(solicitudId, {
                videoInfo: video,
                timestamp: Date.now(),
                messageKey: infoMessage.key
            });

            // Agregar reacciones de forma segura
            await enviarReaccionSegura(sock, jid, infoMessage.key, "👍");
            await enviarReaccionSegura(sock, jid, infoMessage.key, "❤️");

            // Limpiar después de 5 minutos
            setTimeout(() => {
                solicitudesPendientes.delete(solicitudId);
            }, 300000);

        } catch (error) {
            console.error('Error en comando play:', error);

            await enviarReaccionSegura(sock, jid, message.key, "❌");

            await sock.sendMessage(jid, {
                text: `❌ *Error:* ${error.message}`
            }, { quoted: message });
        }
    },

    // Manejar reacciones - REPARADO
    async handleReaction(sock, reaction) {
        try {
            const jid = reaction.key.remoteJid;
            const reactedToId = reaction.key.id;
            const reactionText = reaction.reaction.text;
            const userJid = reaction.key.participant;

            const solicitudId = `${reactedToId}|${jid}`;
            const solicitud = solicitudesPendientes.get(solicitudId);

            if (!solicitud) return;

            // Verificar que la reacción sea válida
            if (!['👍', '❤️'].includes(reactionText)) return;

            // Remover solicitud para evitar procesamiento múltiple
            solicitudesPendientes.delete(solicitudId);

            await enviarReaccionSegura(sock, jid, solicitud.messageKey, "⏳");

            try {
                if (reactionText === '👍') {
                    // Descargar audio
                    await procesarAudio(sock, jid, solicitud.videoInfo);
                    await enviarReaccionSegura(sock, jid, solicitud.messageKey, "✅");
                } else if (reactionText === '❤️') {
                    // Descargar video
                    await procesarVideo(sock, jid, solicitud.videoInfo);
                    await enviarReaccionSegura(sock, jid, solicitud.messageKey, "✅");
                }
            } catch (downloadError) {
                await enviarReaccionSegura(sock, jid, solicitud.messageKey, "❌");

                await sock.sendMessage(jid, {
                    text: `❌ *Error en descarga:* ${downloadError.message}`
                });
            }

        } catch (error) {
            console.error('Error procesando reacción:', error);
        }
    }
};

// Función auxiliar para parsear duración
function parseDuration(durationStr) {
    try {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    } catch {
        return 0;
    }
}