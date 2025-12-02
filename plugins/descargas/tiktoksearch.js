const axios = require('axios');

const Logger = require('../../utils/logger');

// Función para buscar en TikTok
async function tiktokSearch(query, maxRetries = 3) {
    let retries = 0;
    let lastError = null;
    
    while (retries < maxRetries) {
        try {
            const response = await axios.post("https://tikwm.com/api/feed/search", 
                new URLSearchParams({
                    keywords: query, 
                    count: '30',  
                    cursor: '0', 
                    HD: '1'
                }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    Cookie: "current_language=en",
                    "User-Agent": "Mozilla/5.0 (Linux Android 10 K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
                },
                timeout: 10000
            });
            
            const videos = response.data?.data?.videos || [];
            if (videos.length === 0) {
                retries++;
                lastError = "No se encontraron videos.";
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                continue;
            }
            
            return {
                success: true,
                data: videos.map(v => ({
                    description: v.title ? v.title.slice(0, 200) : "Sin descripción", 
                    videoUrl: v.play ? v.play : (v.wmplay || v.hdplay || "Sin URL")
                })).filter(v => v.videoUrl !== "Sin URL") 
            };
            
        } catch (error) {
            retries++;
            lastError = error.message;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
    }
    
    return { 
        success: false, 
        error: lastError || "Error después de varios intentos" 
    };
}

// Función para mezclar elementos aleatoriamente
function getRandomElements(array, count) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}

// Comando principal
module.exports = {
    command: ['tiktoksearch', 'tiktoks', 'ttsearch'],
    description: 'Buscar videos en TikTok',
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
                    text: '❌ Ingresa término de búsqueda.\n💡 Ejemplo: .tiktok memes'
                }, { quoted: message });
                return;
            }

            // Reacción de búsqueda
            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: `🔍 Buscando en TikTok: ${query}`
            }, { quoted: message });

            // Buscar videos
            const searchResult = await tiktokSearch(query);
            
            if (!searchResult.success) {
                throw new Error(searchResult.error);
            }

            let searchResults = searchResult.data;
            
            if (searchResults.length === 0) {
                throw new Error('No se encontraron videos');
            }

            // Seleccionar hasta 10 resultados aleatorios
            let selectedResults = getRandomElements(searchResults, Math.min(searchResults.length, 10));
            
            const BATCH_SIZE = 2;
            const RETRY_ATTEMPTS = 2;
            let successfulCount = 0;
            
            // ✅ CORREGIDO: Todos los videos responden al mensaje original
            for (let i = 0; i < selectedResults.length; i += BATCH_SIZE) {
                const batch = selectedResults.slice(i, i + BATCH_SIZE);
                
                for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
                    try {
                        const batchPromises = batch.map(async (result) => {
                            try {
                                // Descargar video
                                const videoResponse = await axios({
                                    method: 'GET',
                                    url: result.videoUrl,
                                    responseType: 'arraybuffer',
                                    timeout: 20000,
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                    }
                                });

                                const videoBuffer = Buffer.from(videoResponse.data);
                                
                                // ✅ CORREGIDO: Siempre responde al mensaje original
                                await sock.sendMessage(jid, {
                                    video: videoBuffer,
                                    caption: result.description || 'Video de TikTok',
                                    mimetype: 'video/mp4'
                                }, { quoted: message }); // <-- Siempre quoted: message
                                
                                successfulCount++;
                                return true;
                                
                            } catch (videoError) {
                                Logger.debug(`Video falló: ${videoError.message}`);
                                return false;
                            }
                        });

                        await Promise.all(batchPromises);
                        break; // Salir si el lote fue exitoso
                        
                    } catch (batchError) {
                        if (attempt === RETRY_ATTEMPTS) {
                            Logger.error(`Error en lote ${i/BATCH_SIZE + 1}:`, batchError);
                        }
                    }
                }
                
                // Delay entre lotes
                if (i + BATCH_SIZE < selectedResults.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Verificar si se enviaron videos
            if (successfulCount === 0) {
                throw new Error('No se pudieron cargar los videos');
            }

            // Mensaje final también responde al mensaje original
            await sock.sendMessage(jid, { 
                text: `✅ *${successfulCount} videos encontrados*\n📌 *Búsqueda:* ${query}\n⚡ *GUARDIAN BOT*`
            }, { quoted: message });

            // Reacción de éxito
            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            Logger.info(`✅ TikTok search: "${query}" - ${successfulCount} videos enviados`);

        } catch (error) {
            Logger.error('Error en comando TikTok:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: '❌ No se pudo buscar en TikTok.'
            }, { quoted: message });
        }
    }
};