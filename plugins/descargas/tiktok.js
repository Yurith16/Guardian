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
    if (platform === 'tiktok') {
        return links.find(link => /hdplay/.test(link)) || links[0];
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
    command: ['tiktok', 'tt', 'ttdl', 'tiktokdl'],
    description: 'Descargar videos de TikTok',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa un enlace de TikTok*\n\nEjemplo: *tiktok https://vt.tiktok.com/ZSSm2fhLX/*'
            }, { quoted: message });
            return;
        }

        // Validar URL de TikTok
        const tiktokRegex = /(?:https:?\/{2})?(?:w{3}|vm|vt|t)?\.?tiktok.com\/([^\s&]+)/gi;
        if (!tiktokRegex.test(text)) {
            await sock.sendMessage(jid, {
                text: '❌ *Enlace de TikTok no válido*\n\nEjemplo: *tiktok https://vt.tiktok.com/ZSSm2fhLX/*'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Obtener enlaces de descarga
            const links = await fetchDownloadLinks(text, 'tiktok');

            if (!links || links.length === 0) {
                throw new Error('No se pudieron obtener enlaces de descarga');
            }

            const downloadUrl = getDownloadLink('tiktok', links);

            if (!downloadUrl) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            await sock.sendMessage(jid, {
                react: { text: "⬇️", key: message.key }
            });

            // Descargar el video
            const videoBuffer = await descargarBuffer(downloadUrl);

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Enviar el video
            await sock.sendMessage(jid, {
                video: videoBuffer,
                caption: '📱 *Video de TikTok*\n\n💡 *Tip:* Usa *tomp3 para convertir a audio'
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando tiktok:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: `❌ *Error:* ${error.message}\n\n⚠️ Asegúrate de que el enlace sea válido y esté disponible.`
            }, { quoted: message });
        }
    }
};