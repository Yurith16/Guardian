const axios = require('axios');
const yts = require('yt-search');
const crypto = require('crypto');

// Scraper savetube para videos
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
   downloadVideo: async (link, quality = '720') => {
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

// Función para obtener información del video (URL o búsqueda)
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
            throw new Error(`Error al obtener información de la URL: ${error.message}`);
        }
    } else {
        // Es una búsqueda por texto
        try {
            const searchApi = `https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`;
            const searchResponse = await axios.get(searchApi);
            const searchData = searchResponse.data;

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

// Sistema de descarga con fallback
async function descargarVideoConFallback(videoUrl, videoDuration) {
    // Determinar calidad basada en duración para savetube
    let quality = '720';
    if (videoDuration > 600) quality = '480'; // >10 minutos
    if (videoDuration > 1800) quality = '360'; // >30 minutos

    console.log(`🎯 Intentando savetube con calidad: ${quality}p`);

    // PRIMERO: Intentar con savetube
    try {
        const result = await savetube.downloadVideo(videoUrl, quality);
        if (result?.status && result?.result?.download) {
            console.log(`✅ Éxito con savetube (${quality}p)`);
            return {
                url: result.result.download,
                quality: result.result.quality,
                source: 'savetube'
            };
        }
        throw new Error('Savetube no devolvió enlace');
    } catch (error) {
        console.log(`❌ Savetube falló: ${error.message}`);

        // SEGUNDO: Intentar con API Honduras (fallback)
        try {
            console.log('🔄 Intentando con API Honduras...');
            const apiUrl = `https://honduras-api.onrender.com/api/ytmp4?url=${encodeURIComponent(videoUrl)}`;
            const response = await axios.get(apiUrl, { 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data?.éxito && response.data.descarga?.enlace) {
                console.log('✅ Éxito con API Honduras (360p)');
                return {
                    url: response.data.descarga.enlace,
                    quality: '360p',
                    source: 'honduras_api'
                };
            }
            throw new Error('API Honduras no devolvió enlace');
        } catch (apiError) {
            console.log(`❌ API Honduras falló: ${apiError.message}`);
            throw new Error('Todos los métodos de descarga fallaron');
        }
    }
}

// Función para descargar video como buffer
async function descargarVideoBuffer(videoUrl) {
    try {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'arraybuffer',
            timeout: 120000, // 2 minutos
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        return {
            buffer: Buffer.from(response.data),
            sizeMB: (response.data.length / (1024 * 1024)).toFixed(1)
        };
    } catch (error) {
        throw new Error(`Error al descargar el video: ${error.message}`);
    }
}

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

module.exports = {
    command: ['play2', 'videodownload'],
    description: 'Descarga video de YouTube (URL o búsqueda)',
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            await sock.sendMessage(jid, {
                text: ` *「🎬」 PLAY2*\n\n> ✦ Ingresa una URL de YouTube o texto para buscar\n> ⴵ Ejemplo URL: .play2 https://youtu.be/abc123\n> ✰ Ejemplo texto: .play2 Shakira`
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Obtener información del video (URL o búsqueda)
            const video = await obtenerInformacionVideo(text);

            // Mostrar información (diseño idéntico a play)
            const videoDetails = ` *「✦」 ${video.title}*\n\n` +
                `> ✦ *Canal:* » ${video.author.name}\n` +
                `> ⴵ *Duración:* » ${video.duration.timestamp}\n` +
                `> ✰ *Vistas:* » ${(video.views || 0).toLocaleString()}\n` +
                `> ✐ *Publicado:* » ${video.ago || 'Desconocido'}\n` +
                `> 🜸 *Enlace:* » ${video.url}`;

            await sock.sendMessage(jid, {
                image: { url: video.thumbnail },
                caption: videoDetails.trim()
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "⬇️", key: message.key }
            });

            // Descargar video con sistema de fallback
            const videoDuration = video.duration.seconds || 0;
            const downloadResult = await descargarVideoConFallback(video.url, videoDuration);

            if (!downloadResult?.url) {
                await sock.sendMessage(jid, {
                    text: ` *「❌」 ERROR*\n\n> ✦ No se pudo obtener el video`
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Descargar el video usando axios
            const videoData = await descargarVideoBuffer(downloadResult.url);
            const fileSizeMB = videoData.sizeMB;

            // Enviar como documento si es mayor a 60MB
            if (parseFloat(fileSizeMB) > 60) {
                await sock.sendMessage(jid, {
                    document: videoData.buffer,
                    fileName: `${video.title.substring(0, 64)}.mp4`,
                    mimetype: 'video/mp4'
                }, { quoted: message });
            } else {
                await sock.sendMessage(jid, {
                    video: videoData.buffer,
                    caption: ` *「🎬」 ${video.title}*\n\n> ✦ Duración: » ${video.duration.timestamp}\n> ⴵ Calidad: » ${downloadResult.quality}\n> ✰ Tamaño: » ${fileSizeMB}MB`
                }, { quoted: message });
            }

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando play2:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: ` *「❌」 ERROR*\n\n> ✦ Error al procesar la solicitud:\n> ⴵ ${error.message}`
            }, { quoted: message });
        }
    }
};