// plugins/utilidades/google.js
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
    command: ['google', 'buscar', 'search'],
    aliases: ['g'],
    description: 'Buscar en Google',
    help: [
        '🔍 *Uso:* .google <término de búsqueda>',
        '   Busca información en Google',
        '   Ejemplo: .google cómo hacer un bot de WhatsApp',
        '',
        '📊 *Uso avanzado:* .google -n 5 <término>',
        '   Muestra 5 resultados específicos'
    ],
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const query = args.join(' ');

        if (!query) {
            await sock.sendMessage(jid, {
                text: '❌ *Debes especificar qué buscar*\n\nEjemplo: .google inteligencia artificial'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key }
            });

            // Buscar en Google
            const response = await axios.get(`https://www.google.com/search`, {
                params: { q: query },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const resultados = [];

            // Extraer resultados principales
            $('div.g').each((i, elem) => {
                if (i < 5) { // Limitar a 5 resultados
                    const titulo = $(elem).find('h3').text();
                    const enlace = $(elem).find('a').attr('href');
                    const descripcion = $(elem).find('div.VwiC3b').text();

                    if (titulo && enlace && descripcion) {
                        resultados.push({
                            titulo,
                            enlace: enlace.startsWith('/url?q=') ? 
                                   decodeURIComponent(enlace.split('/url?q=')[1].split('&')[0]) : 
                                   enlace,
                            descripcion: descripcion.slice(0, 150) + '...'
                        });
                    }
                }
            });

            if (resultados.length === 0) {
                await sock.sendMessage(jid, {
                    text: '❌ *No se encontraron resultados*'
                }, { quoted: message });
                return;
            }

            // Formatear respuesta
            let respuesta = `🔍 *Resultados para:* ${query}\n\n`;
            
            resultados.forEach((res, index) => {
                respuesta += `*${index + 1}. ${res.titulo}*\n`;
                respuesta += `${res.descripcion}\n`;
                respuesta += `🔗 ${res.enlace}\n\n`;
            });

            respuesta += `📊 *Total resultados:* ${resultados.length}\n`;
            respuesta += `🌐 *Fuente:* Google Search`;

            await sock.sendMessage(jid, {
                text: respuesta
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en búsqueda Google:', error);
            
            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });
            
            await sock.sendMessage(jid, {
                text: `❌ *Error en la búsqueda:* ${error.message}`
            }, { quoted: message });
        }
    }
};