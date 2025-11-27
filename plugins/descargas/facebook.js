const axios = require('axios');
const cheerio = require('cheerio');

// Función para obtener enlaces de descarga
async function fetchDownloadLinks(text, platform) {
    const { SITE_URL, form } = createApiRequest(text, platform);

    const res = await axios.post(`${SITE_URL}api`, form.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': SITE_URL,
            'Referer': SITE_URL,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 30000
    });

    const html = res?.data?.html;

    if (!html || res?.data?.status !== 'success') {
        return null;
    }

    const $ = cheerio.load(html);
    const links = [];

    $('a.btn[href^="http"]').each((_, el) => {
        const link = $(el).attr('href');
        if (link && !links.includes(link)) {
            links.push(link);
        }
    });

    return links;
}

function createApiRequest(text, platform) {
    const SITE_URL = 'https://instatiktok.com/';
    const form = new URLSearchParams();
    form.append('url', text);
    form.append('platform', platform);
    form.append('siteurl', SITE_URL);
    return { SITE_URL, form };
}

function getDownloadLink(platform, links) {
    if (platform === 'facebook') {
        return links.at(-1); // Último enlace (generalmente el de mejor calidad)
    }
    return null;
}

// Función para descargar buffer
async function descargarBuffer(url) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Error al descargar: ${error.message}`);
    }
}

module.exports = {
    command: ['facebook', 'fb', 'fbdl', 'facebookdl'],
    description: 'Descargar videos de Facebook',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa un enlace de Facebook*\n\nEjemplo: *facebook https://www.facebook.com/share/v/1E5R3gRuHk/*'
            }, { quoted: message });
            return;
        }

        // Validar URL de Facebook
        const facebookRegex = /(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch)\/([^\s]+)/i;
        if (!facebookRegex.test(text)) {
            await sock.sendMessage(jid, {
                text: '❌ *Enlace de Facebook no válido*'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Obtener enlaces de descarga
            const links = await fetchDownloadLinks(text, 'facebook');

            if (!links || links.length === 0) {
                throw new Error('No se encontraron enlaces de descarga');
            }

            const downloadUrl = getDownloadLink('facebook', links);

            if (!downloadUrl) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬇️", key: message.key }
            });

            // Determinar si es video o imagen
            const isVideo = downloadUrl.includes('.mp4') || downloadUrl.includes('video');

            if (isVideo) {
                // Descargar y enviar video
                const videoBuffer = await descargarBuffer(downloadUrl);

                await sock.sendMessage(jid, {
                    react: { text: "⬆️", key: message.key }
                });

                await sock.sendMessage(jid, {
                    video: videoBuffer,
                    caption: '📹 *Video de Facebook*'
                });

            } else {
                // Enviar imagen directamente
                await sock.sendMessage(jid, {
                    react: { text: "⬆️", key: message.key }
                });

                await sock.sendMessage(jid, {
                    image: { url: downloadUrl },
                    caption: '🖼️ *Imagen de Facebook*'
                });
            }

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando facebook:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo descargar el contenido*'
            }, { quoted: message });
        }
    }
};