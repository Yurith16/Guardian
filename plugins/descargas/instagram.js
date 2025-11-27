const axios = require("axios");

// Función de descarga de Instagram
const instagramDownload = async (url) => {
  return new Promise(async (resolve) => {
    if (!url.match(/\/(reel|reels|p|stories|tv|s)\/[a-zA-Z0-9_-]+/i)) {
      return resolve({ status: false });
    }

    try {
      let jobId = await (
        await axios.post(
          "https://app.publer.io/hooks/media",
          {
            url: url,
            iphone: false,
          },
          {
            headers: {
              Accept: "/",
              "Accept-Encoding": "gzip, deflate, br, zstd",
              "Accept-Language": "es-ES,es;q=0.9",
              "Cache-Control": "no-cache",
              Origin: "https://publer.io",
              Pragma: "no-cache",
              Priority: "u=1, i",
              Referer: "https://publer.io/",
              "Sec-CH-UA":
                '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
              "Sec-CH-UA-Mobile": "?0",
              "Sec-CH-UA-Platform": '"Windows"',
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            },
          },
        )
      ).data.job_id;

      let status = "working";
      let jobStatusResponse;

      while (status !== "complete") {
        jobStatusResponse = await axios.get(
          `https://app.publer.io/api/v1/job_status/${jobId}`,
          {
            headers: {
              Accept: "application/json, text/plain, /",
              "Accept-Encoding": "gzip, deflate, br, zstd",
              "Accept-Language": "es-ES,es;q=0.9",
              "Cache-Control": "no-cache",
              Origin: "https://publer.io",
              Pragma: "no-cache",
              Priority: "u=1, i",
              Referer: "https://publer.io/",
              "Sec-CH-UA":
                '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
              "Sec-CH-UA-Mobile": "?0",
              "Sec-CH-UA-Platform": '"Windows"',
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            },
          },
        );
        status = jobStatusResponse.data.status;

        // Esperar antes de verificar nuevamente
        if (status !== "complete") {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      let data = jobStatusResponse.data.payload.map((item) => {
        return {
          type: item.type === "photo" ? "image" : "video",
          url: item.path,
        };
      });

      resolve({
        status: true,
        data,
      });
    } catch (e) {
      resolve({
        status: false,
        msg: new Error(e).message,
      });
    }
  });
};

module.exports = {
    command: ['instagram', 'ig', 'igdl', 'instagramdl'],
    description: 'Descargar videos/fotos de Instagram',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const url = args[0];

        if (!url) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa un enlace de Instagram*\n\nEjemplo: *instagram https://www.instagram.com/reel/C8sWV3Nx_GZ/*'
            }, { quoted: message });
            return;
        }

        // Validar URL de Instagram
        const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|stories|tv)\/[a-zA-Z0-9_-]+\/?/i;
        if (!instagramRegex.test(url)) {
            await sock.sendMessage(jid, {
                text: '❌ *Enlace de Instagram no válido*'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Intentar con el método principal (Publer)
            const result = await instagramDownload(url);

            if (result.status && result.data && result.data.length > 0) {
                await sock.sendMessage(jid, {
                    react: { text: "⬇️", key: message.key }
                });

                // Enviar cada medio
                for (let i = 0; i < result.data.length; i++) {
                    const item = result.data[i];
                    if (item.type === "image") {
                        await sock.sendMessage(jid, { 
                            image: { url: item.url } 
                        });
                    } else if (item.type === "video") {
                        await sock.sendMessage(jid, { 
                            video: { url: item.url } 
                        });
                    }

                    // Pequeño delay entre envíos
                    if (i < result.data.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                await sock.sendMessage(jid, {
                    react: { text: "✅", key: message.key }
                });

            } else {
                // Si falla el método principal, intentar con API alternativa
                try {
                    const res = await axios.get("https://delirius-apiofc.vercel.app/download/instagram", { 
                        params: { url: url },
                        timeout: 30000
                    });

                    const apiResult = res.data.data;

                    if (!apiResult || apiResult.length === 0) {
                        throw new Error("No se pudo descargar el contenido");
                    }

                    await sock.sendMessage(jid, {
                        react: { text: "⬇️", key: message.key }
                    });

                    for (let i = 0; i < apiResult.length; i++) {
                        const item = apiResult[i];
                        if (item.type === "image") {
                            await sock.sendMessage(jid, { 
                                image: { url: item.url } 
                            });
                        } else if (item.type === "video") {
                            await sock.sendMessage(jid, { 
                                video: { url: item.url } 
                            });
                        }

                        if (i < apiResult.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    await sock.sendMessage(jid, {
                        react: { text: "✅", key: message.key }
                    });

                } catch (apiError) {
                    throw new Error("No se pudo descargar el video");
                }
            }

        } catch (error) {
            console.error('Error en comando Instagram:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '❌ *No se pudo descargar el video*'
            }, { quoted: message });
        }
    }
};