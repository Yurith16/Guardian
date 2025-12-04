const yts = require("yt-search");
const axios = require("axios");
const crypto = require("crypto");

const Logger = require('../../utils/logger');

// Configuración del sistema
const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 120000;
const REQUEST_DELAY = 2000;

// Scraper savetube
class SavetubeDownloader {
    constructor() {
        this.api = {
            base: "https://media.savetube.me/api",
            cdn: "/random-cdn",
            info: "/v2/info",
            download: "/download"
        };
        
        this.headers = {
            'accept': '*/*',
            'content-type': 'application/json',
            'origin': 'https://yt.savetube.me',
            'referer': 'https://yt.savetube.me/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
    }

    extractVideoId(url) {
        if (!url) return null;
        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/
        ];
        
        for (let pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async request(endpoint, data = {}, method = 'post', retry = 0) {
        try {
            const response = await axios({
                method,
                url: `${endpoint.startsWith('http') ? '' : this.api.base}${endpoint}`,
                data: method === 'post' ? data : undefined,
                params: method === 'get' ? data : undefined,
                headers: this.headers,
                timeout: 30000
            });
            
            return response.data;
        } catch (error) {
            if (retry < MAX_RETRIES) {
                await this.delay(1000 * (retry + 1));
                return this.request(endpoint, data, method, retry + 1);
            }
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    async getCDN() {
        const response = await this.request(this.api.cdn, {}, 'get');
        return response.cdn;
    }

    async decryptData(encryptedData) {
        try {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(encryptedData, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            
            const keyBuffer = Buffer.from(secretKey, 'hex');
            const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, iv);
            
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            return JSON.parse(decrypted.toString());
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    async downloadAudio(youtubeUrl) {
        try {
            const videoId = this.extractVideoId(youtubeUrl);
            if (!videoId) throw new Error('URL de YouTube no válida');

            const cdn = await this.getCDN();
            
            const infoResponse = await this.request(`https://${cdn}${this.api.info}`, {
                url: `https://www.youtube.com/watch?v=${videoId}`
            });

            const decryptedData = await this.decryptData(infoResponse.data);

            const downloadResponse = await this.request(`https://${cdn}${this.api.download}`, {
                id: videoId,
                downloadType: 'audio',
                quality: '128',
                key: decryptedData.key
            });

            return {
                success: true,
                data: {
                    title: decryptedData.title || "Unknown Title",
                    thumbnail: decryptedData.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                    duration: decryptedData.duration || 0,
                    downloadUrl: downloadResponse.data.downloadUrl,
                    videoId: videoId
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Función para validar URLs de YouTube
function isValidYouTubeUrl(text) {
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube.com\/)/i;
    return ytRegex.test(text);
}

// Función para obtener información del video
async function obtenerInformacionVideo(text, retry = 0) {
    try {
        const esUrl = isValidYouTubeUrl(text);

        if (esUrl) {
            const videoId = text.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
            if (!videoId) throw new Error('ID de video no válido');

            const videoInfo = await yts({ videoId: videoId });
            if (!videoInfo?.title) throw new Error('Información no disponible');

            return {
                success: true,
                data: {
                    videoId: videoId,
                    url: `https://youtu.be/${videoId}`,
                    title: videoInfo.title,
                    author: { name: videoInfo.author?.name || 'Desconocido' },
                    duration: {
                        seconds: videoInfo.seconds || 0,
                        timestamp: videoInfo.timestamp || '00:00'
                    },
                    thumbnail: videoInfo.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                    views: videoInfo.views || 0,
                    ago: videoInfo.ago || 'Desconocido'
                }
            };
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                throw new Error('No se encontraron resultados');
            }

            const video = videos[0];
            return {
                success: true,
                data: {
                    videoId: video.videoId,
                    url: video.url,
                    title: video.title,
                    author: { name: video.author?.name || 'Desconocido' },
                    duration: {
                        seconds: video.seconds || 0,
                        timestamp: video.timestamp || '00:00'
                    },
                    thumbnail: video.thumbnail,
                    views: video.views || 0,
                    ago: video.ago || 'Desconocido'
                }
            };
        }
    } catch (error) {
        if (retry < MAX_RETRIES) {
            await delay(1000 * (retry + 1));
            return obtenerInformacionVideo(text, retry + 1);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

// Helper: delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: sanitizar nombre de archivo
function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 64);
}

// Función para crear barra de progreso (estilo LOADING...)
function crearBarraProgreso(progreso = 0) {
    const totalBarras = 20; // 20 bloques para más detalle
    const barrasLlenas = Math.round((progreso / 100) * totalBarras);
    const barrasVacias = totalBarras - barrasLlenas;
    
    // Usa bloques sólidos y bloques claros
    const barra = '█'.repeat(barrasLlenas) + '░'.repeat(barrasVacias);
    return `L O A D I N G . . .\n[${barra}] ${progreso}%`;
}

// Función para simular y actualizar el progreso en el chat
async function updateProgress(sock, jid, messageKey, start, end, step, delayMs, statusText = 'Procesando audio...') {
    for (let i = start; i <= end; i += step) {
        // Asegura que no nos pasemos del valor final
        let currentProgress = i;
        if (currentProgress > end) currentProgress = end;

        try {
            await sock.sendMessage(jid, {
                text: `📥 ${statusText}\n${crearBarraProgreso(currentProgress)}`,
                edit: messageKey
            });
        } catch (e) {
            // Si no se puede editar el mensaje, continuamos
            break; 
        }
        await delay(delayMs);
    }
}

// Comando principal
module.exports = {
    command: ['playdoc', 'mp3doc'],
    description: 'Descargar audio de YouTube como documento con barra de progreso',
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const query = args.join(' ').trim();

        try {
            if (!query) {
                await sock.sendMessage(jid, { 
                    text: '❌ Ingresa nombre o URL del video.'
                }, { quoted: message });
                return;
            }

            // 1. Obtener información del video primero
            const videoInfo = await obtenerInformacionVideo(query);
            if (!videoInfo.success) {
                await sock.sendMessage(jid, { 
                    text: `❌ ${videoInfo.error}`
                }, { quoted: message });
                return;
            }

            const video = videoInfo.data;

            // 2. Enviar imagen de portada con mensaje "Procesando pedido..." en mensaje separado
            try {
                const thumbnailResponse = await axios({
                    method: 'GET',
                    url: video.thumbnail,
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                thumbnailBuffer = Buffer.from(thumbnailResponse.data);
                
                // Enviar imagen en mensaje separado
                await sock.sendMessage(jid, {
                    image: thumbnailBuffer,
                    caption: '📥 Procesando pedido...'
                }, { quoted: message });
                
            } catch (error) {
                // Si falla la imagen, enviar solo texto
                await sock.sendMessage(jid, { 
                    text: '📥 Procesando pedido...'
                }, { quoted: message });
            }

            await delay(500);

            // 3. Enviar mensaje inicial de barra de carga (0%)
            let processingMessage = await sock.sendMessage(jid, { 
                text: '🔍 Buscando música...\n' + crearBarraProgreso(0) 
            }, { quoted: message });
            
            // 4. Simular progreso de búsqueda de info (1% a 25%)
            await updateProgress(sock, jid, processingMessage.key, 1, 25, 2, 100, 'Buscando información...');

            // 5. Simular progreso de la API de descarga (26% a 50%)
            await updateProgress(sock, jid, processingMessage.key, 26, 50, 3, 100, 'Preparando descarga...');

            // 6. Descargar audio (API Savetube)
            const downloader = new SavetubeDownloader();
            const downloadResult = await downloader.downloadAudio(video.url);

            if (!downloadResult.success) {
                throw new Error(downloadResult.error);
            }

            const audioData = downloadResult.data;

            // 7. Descargar el audio como buffer (Axios) y simular progreso (51% a 80%)
            
            // Preparamos la descarga real (Promise)
            const audioPromise = axios({
                method: 'GET',
                url: audioData.downloadUrl,
                responseType: 'arraybuffer',
                timeout: DOWNLOAD_TIMEOUT
            });
            
            // Preparamos la simulación de progreso (Promise)
            const progressSimulation = updateProgress(sock, jid, processingMessage.key, 51, 80, 3, 300, 'Descargando audio...');
            
            // Ejecutamos ambos en paralelo
            const [audioResponse] = await Promise.all([audioPromise, progressSimulation]);

            const audioBuffer = Buffer.from(audioResponse.data);
            
            // 8. Simular progreso de envío/carga a WhatsApp (81% a 99%)
            await updateProgress(sock, jid, processingMessage.key, 81, 99, 1, 300, 'Subiendo a WhatsApp...');

            // 9. Enviar mensaje final ANTES de enviar el audio
            try {
                await sock.sendMessage(jid, {
                    text: '✅ ¡Descarga completa! Enviando audio...\n' + crearBarraProgreso(100),
                    edit: processingMessage.key
                });
            } catch (e) {
                // Si no se puede editar, continuar
            }

            // Pequeña pausa para que se vea el mensaje final
            await delay(1000);

            // 10. Enviar como documento (audio)
            const messageOptions = {
                document: audioBuffer,
                fileName: `${sanitizeFileName(video.title)}.mp3`,
                mimetype: 'audio/mpeg'
            };

            await sock.sendMessage(jid, messageOptions, { quoted: message });

            // 11. NO ELIMINAR el mensaje de la barra de carga (se queda visible)
            // Se queda el mensaje con 100% como finalización

            Logger.info(`✅ Audio enviado como documento: ${video.title}`);

        } catch (error) {
            Logger.error('Error en comando audiodoc:', error);
            await sock.sendMessage(jid, { 
                text: '❌ No se pudo descargar el audio.'
            }, { quoted: message });
        }
    }
};