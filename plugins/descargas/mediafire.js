const axios = require('axios');
const cheerio = require('cheerio');
const mime = require('mime-types');

// Función principal de descarga de MediaFire
async function mediafireDl(url) {
  try {
    if (!url.includes('www.mediafire.com')) throw new Error('URL de MediaFire inválida');

    let res;
    let $;
    let link = null;

    try {
      // Primer intento: descarga directa
      res = await axios.get(url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        timeout: 30000
      });

      $ = cheerio.load(res.data);
      const downloadButton = $('#downloadButton');
      link = downloadButton.attr('href');

      // Si no funciona el enlace directo, buscar alternativas
      if (!link || link.includes('javascript:void(0)')) { 
        link = downloadButton.attr('data-href') || downloadButton.attr('data-url') || downloadButton.attr('data-link');

        const scrambledUrl = downloadButton.attr('data-scrambled-url');
        if (scrambledUrl) {
          try {
            link = Buffer.from(scrambledUrl, 'base64').toString();
          } catch (e) {
            console.log('Error decodificando scrambled URL:', e.message);
          }
        }

        if (!link || link.includes('javascript:void(0)')) {
          const htmlContent = res.data;
          const linkMatch = htmlContent.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/);
          if (linkMatch) {
            link = linkMatch[1];
          } else {
            const altMatch = htmlContent.match(/"(https:\/\/[^"]*mediafire[^"]*\.(zip|rar|pdf|jpg|jpeg|png|gif|mp4|mp3|exe|apk|txt)[^"]*)"/i);
            if (altMatch) {
              link = altMatch[1];
            }
          }
        }
      }
    } catch (directError) {
      // Segundo intento: usar traducción de Google
      const translateUrl = `https://www-mediafire-com.translate.goog/${url.replace('https://www.mediafire.com/', '')}?_x_tr_sl=en&_x_tr_tl=fr&_x_tr_hl=en&_x_tr_pto=wapp`;
      res = await axios.get(translateUrl, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        timeout: 30000
      });

      $ = cheerio.load(res.data);
      const downloadButton = $('#downloadButton');
      link = downloadButton.attr('href');

      if (!link || link.includes('javascript:void(0)')) {
        const scrambledUrl = downloadButton.attr('data-scrambled-url');
        if (scrambledUrl) {
          try {
            link = Buffer.from(scrambledUrl, 'base64').toString();
          } catch (e) {}
        }
      }
    }

    if (!link || link.includes('javascript:void(0)')) {
      throw new Error('No se pudo encontrar el enlace de descarga');
    }

    // Obtener información del archivo
    const name = $('body > main > div.content > div.center > div > div.dl-btn-cont > div.dl-btn-labelWrap > div.promoDownloadName.notranslate > div').attr('title')?.replace(/\s+/g, ' ')?.replace(/\n/g, '') || 
                 $('.dl-btn-label').attr('title') || 
                 $('.filename').text().trim() || 
                 'archivo_descargado';

    const date = $('body > main > div.content > div.center > div > div.dl-info > ul > li:nth-child(2) > span').text().trim() || 
                 $('.details li:nth-child(2) span').text().trim() || 
                 'Fecha no disponible';

    const size = $('#downloadButton').text().replace('Download', '').replace(/[()]/g, '').replace(/\n/g, '').replace(/\s+/g, ' ').trim() || 
                 $('.details li:first-child span').text().trim() || 
                 'Tamaño no disponible';

    const ext = name.split('.').pop()?.toLowerCase();
    const mimeType = mime.lookup(ext) || 'application/octet-stream';

    if (!link.startsWith('http')) throw new Error('Enlace de descarga inválido');

    return { name, size, date, mime: mimeType, link };

  } catch (error) {
    console.error('Error en mediafireDl:', error.message);
    throw new Error(`Error al procesar: ${error.message}`);
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
    throw new Error(`Error al descargar archivo: ${error.message}`);
  }
}

module.exports = {
    command: ['mediafire', 'mf', 'mediafiredl', 'mfdl'],
    description: 'Descargar archivos de MediaFire',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const url = args[0];

        if (!url) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa un enlace de MediaFire*\n\nEjemplo: *mediafire https://www.mediafire.com/file/abc123/archivo.zip*'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Obtener información del archivo
            const res = await mediafireDl(url);
            const { name, size, date, mime, link } = res;

            await sock.sendMessage(jid, {
                react: { text: "⬇️", key: message.key }
            });

            // Crear información del archivo
            const fileInfo = `📁 *MediaFire Download*\n\n` +
                           `📄 *Nombre:* ${name}\n` +
                           `📦 *Tamaño:* ${size}\n` +
                           `📅 *Fecha:* ${date}\n` +
                           `🔗 *Tipo:* ${mime}`;

            // Enviar información primero
            await sock.sendMessage(jid, {
                text: fileInfo
            }, { quoted: message });

            // Descargar y enviar archivo
            const fileBuffer = await descargarBuffer(link);

            await sock.sendMessage(jid, {
                react: { text: "⬆️", key: message.key }
            });

            // Enviar como documento
            await sock.sendMessage(jid, {
                document: fileBuffer,
                fileName: name,
                mimetype: mime
            });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en comando mediafire:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: `❌ *Error:* ${error.message}`
            }, { quoted: message });
        }
    }
};