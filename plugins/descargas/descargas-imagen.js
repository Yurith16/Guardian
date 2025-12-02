const axios = require('axios');

const Logger = require('../../utils/logger');

// API base
const API_BASE = "https://delirius-apiofc.vercel.app";

// Helper: delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Comando principal
module.exports = {
    command: ['imagen', 'gimage', 'image', 'img'],
    description: 'Buscar y descargar imágenes',
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
                    text: '❌ Ingresa término de búsqueda.\n💡 Ejemplo: .imagen paisajes'
                }, { quoted: message });
                return;
            }

            // Reacción de búsqueda
            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: `🔍 Buscando imágenes: ${query}`
            }, { quoted: message });

            // Hacer la petición a la API
            const apiUrl = `${API_BASE}/search/gimage?query=${encodeURIComponent(query)}`;
            const response = await axios.get(apiUrl);
            
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                throw new Error('No images found');
            }

            const allImages = response.data.data;
            
            // Filtrar solo imágenes válidas
            const validImages = allImages.filter(image => {
                const url = image.url.toLowerCase();
                return url.endsWith('.jpg') || 
                       url.endsWith('.jpeg') || 
                       url.endsWith('.png') || 
                       url.endsWith('.webp');
            });

            if (validImages.length === 0) {
                throw new Error('No valid images');
            }

            // Seleccionar hasta 5 imágenes aleatorias
            const selectedImages = [];
            const maxImages = Math.min(5, validImages.length);
            
            // Mezclar array y tomar las primeras 5
            const shuffled = [...validImages].sort(() => 0.5 - Math.random());
            for (let i = 0; i < maxImages; i++) {
                selectedImages.push(shuffled[i]);
            }

            // Contador de imágenes enviadas
            let sentCount = 0;

            // Enviar cada imagen con delay de 500ms
            for (let i = 0; i < selectedImages.length; i++) {
                try {
                    const image = selectedImages[i];
                    
                    // Descargar la imagen como buffer
                    const imageResponse = await axios({
                        method: 'GET',
                        url: image.url,
                        responseType: 'arraybuffer',
                        timeout: 15000, // 15 segundos por imagen
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });

                    const imageBuffer = Buffer.from(imageResponse.data);

                    // Determinar el tipo MIME
                    let mimeType = 'image/jpeg';
                    const urlLower = image.url.toLowerCase();
                    
                    if (urlLower.endsWith('.png')) {
                        mimeType = 'image/png';
                    } else if (urlLower.endsWith('.webp')) {
                        mimeType = 'image/webp';
                    }

                    // Enviar la imagen SIN caption
                    await sock.sendMessage(jid, {
                        image: imageBuffer,
                        mimetype: mimeType
                    }, { quoted: i === 0 ? message : null }); // Solo la primera responde al mensaje

                    sentCount++;
                    
                    // Delay de 500ms entre imágenes
                    if (i < selectedImages.length - 1) {
                        await delay(500);
                    }

                } catch (imageError) {
                    // Si falla una imagen, continuar con la siguiente sin mostrar error
                    Logger.debug(`Imagen ${i + 1} falló: ${imageError.message}`);
                    continue;
                }
            }

            // Reacción de éxito si se envió al menos una imagen
            if (sentCount > 0) {
                await sock.sendMessage(jid, {
                    react: { text: "✅", key: message.key }
                });

                Logger.info(`✅ ${sentCount}/${selectedImages.length} imágenes enviadas: "${query}"`);
            } else {
                // Si no se pudo enviar ninguna imagen
                throw new Error('All images failed');
            }

        } catch (error) {
            Logger.error('Error en comando imagen:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: '❌ No se pudo encontrar la imagen.'
            }, { quoted: message });
        }
    }
};