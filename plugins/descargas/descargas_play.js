const axios = require('axios');
const crypto = require('crypto');

// Scraper savetube
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
            throw new Error('Error decrypting data')
         }
      }
   },
   youtube: url => {
      if (!url) return null;
      const patterns = [
         /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
         /youtu\.be\/([a-zA-Z0-9_-]{11})/
      ];
      for (let pattern of patterns) {
         if (pattern.test(url)) return url.match(pattern)[1];
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
         throw new Error('Request failed')
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
      if (!link) throw new Error('No link provided')
      
      const id = savetube.youtube(link);
      if (!id) throw new Error('Invalid YouTube link');
      
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
            throw new Error('Failed to get download link');
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
         throw new Error('An error occurred while processing your request');
      }
   }
};

// Función para buscar video
async function buscarVideo(text) {
    try {
        const searchApi = `https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`;
        const searchResponse = await axios.get(searchApi);
        const searchData = searchResponse.data;

        if (!searchData?.data || searchData.data.length === 0) {
            throw new Error(`No se encontraron resultados para "${text}"`);
        }

        const video = searchData.data[0];
        return {
            videoId: video.id || 'unknown',
            url: video.url,
            title: video.title,
            author: { name: video.author?.name || 'Desconocido' },
            duration: {
                timestamp: video.duration || '00:00'
            },
            thumbnail: video.image || video.thumbnail,
            views: video.views || 0,
            ago: video.publishedAt || 'Desconocido'
        };
    } catch (error) {
        throw new Error(`Error en búsqueda: ${error.message}`);
    }
}

// Función para obtener info de video
async function obtenerInfoVideo(url) {
    try {
        const id = savetube.youtube(url);
        if (!id) throw new Error('URL no válida');
        
        const response = await axios.get(`https://noembed.com/embed?url=https://youtu.be/${id}`);
        const data = response.data;
        
        return {
            videoId: id,
            url: `https://youtu.be/${id}`,
            title: data.title || 'Sin título',
            author: { name: data.author_name || 'Desconocido' },
            duration: {
                timestamp: '00:00'
            },
            thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
            views: 0,
            ago: ''
        };
    } catch (error) {
        throw new Error('Error obteniendo información del video');
    }
}

module.exports = {
    command: ['play', 'playaudio'],
    description: 'Descargar audio de YouTube',
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            await sock.sendMessage(jid, {
                text: ` *「🎵」 PLAY*\n\n` +
                      `> ✦ Ingresa una URL de YouTube o texto para buscar\n` +
                      `> ⴵ Ejemplo URL: .play https://youtu.be/abc123\n` +
                      `> ✰ Ejemplo texto: .play nombre de canción`
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            let videoInfo;

            // Verificar si es URL
            const isUrl = text.includes('youtube.com') || text.includes('youtu.be');
            
            if (isUrl) {
                videoInfo = await obtenerInfoVideo(text);
            } else {
                videoInfo = await buscarVideo(text);
            }

            // Mostrar información CON IMAGEN (como el original)
            const videoDetails = ` *「✦」 ${videoInfo.title}*\n\n` +
                                `> ✦ *Canal:* » ${videoInfo.author.name}\n` +
                                `> ⴵ *Duración:* » ${videoInfo.duration.timestamp}\n` +
                                `> ✰ *Vistas:* » ${(videoInfo.views || 0).toLocaleString()}\n` +
                                `> ✐ *Publicado:* » ${videoInfo.ago || 'Desconocido'}\n` +
                                `> 🜸 *Enlace:* » ${videoInfo.url}`;

            await sock.sendMessage(jid, {
                image: { url: videoInfo.thumbnail },
                caption: videoDetails.trim()
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "⬇️", key: message.key }
            });

            // Descargar audio
            const downloadResult = await savetube.downloadAudio(videoInfo.url);

            if (!downloadResult?.status || !downloadResult?.result?.download) {
                throw new Error('No se pudo obtener el audio del video');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Descargar y enviar audio
            const audioResponse = await axios({
                method: 'GET',
                url: downloadResult.result.download,
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const audioBuffer = Buffer.from(audioResponse.data);

            await sock.sendMessage(jid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${videoInfo.title.substring(0, 64)}.mp3`
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando play:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: ` *「❌」 ERROR*\n\n` +
                      `> ✦ Error al procesar la solicitud:\n` +
                      `> ⴵ ${error.message}`
            }, { quoted: message });
        }
    }
};