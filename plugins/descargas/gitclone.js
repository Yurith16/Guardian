const axios = require('axios');

// Sistema de descargas activas por usuario
const activeDownloads = new Map();
const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;

module.exports = {
    command: ['gitclone', 'git'],
    description: 'Descargar repositorios de GitHub',
    isOwner: false,
    isGroup: true,
    isPrivate: true,
    isAdmin: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const userId = message.key.participant || jid;
        const userNumber = userId.split("@")[0];
        const url = args[0];

        // Verificar si ya tiene una descarga en proceso
        if (activeDownloads.has(userNumber)) {
            await sock.sendMessage(jid, {
                text: ` *「⏳」 ESPERA*\n\n` +
                      `> Ya tienes una descarga en curso, espera a que termine, bb`
            }, { quoted: message });
            return;
        }

        // Si no hay URL, pedirla
        if (!url) {
            await sock.sendMessage(jid, {
                text: ` *「📦」 DESCARGAR REPOSITORIO*\n\n` +
                      `> Ingresa una URL de GitHub\n` +
                      `> Ejemplo: .git https://github.com/usuario/repositorio`
            }, { quoted: message });
            return;
        }

        try {
            // Marcar que el usuario tiene una descarga activa
            activeDownloads.set(userNumber, true);

            if (!regex.test(url)) {
                await sock.sendMessage(jid, {
                    text: ` *「❌」 ERROR DE URL*\n\n` +
                          `> URL de GitHub no válida\n` +
                          `> Asegúrate que sea un enlace válido, cariño`
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key }
            });

            let [_, user, repo] = url.match(regex) || [];
            repo = repo.replace(/.git$/, "");

            // Mensaje simple de descarga
            await sock.sendMessage(jid, {
                text: ` *「📥」 DESCARGANDO*\n\n` +
                      `> Repositorio: ${user}/${repo}\n` +
                      `> Estado: Descargando...`
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            const apiUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

            // Descargar el archivo
            const response = await axios({
                method: 'GET',
                url: apiUrl,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            // Obtener nombre del archivo
            const contentDisposition = response.headers['content-disposition'];
            const filename = contentDisposition 
                ? contentDisposition.match(/attachment; filename=(.*)/)[1]
                : `${user}_${repo}.zip`;

            const fileBuffer = Buffer.from(response.data, 'binary');

            await sock.sendMessage(jid, {
                react: { text: "📤", key: message.key }
            });

            // Enviar como documento
            await sock.sendMessage(jid, {
                document: fileBuffer,
                fileName: filename,
                mimetype: 'application/zip',
                caption: ` *「✅」 DESCARGA COMPLETADA*\n\n` +
                        `> Repositorio: ${user}/${repo}\n` +
                        `> Formato: ZIP\n` +
                        `> Estado: Listo para usar`
            }, { quoted: message });

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

        } catch (error) {
            console.error('Error en gitclone:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            let errorMessage = ` *「❌」 ERROR*\n\n` +
                              `> No se pudo descargar el repositorio\n` +
                              `> Verifica la URL o intenta más tarde`;

            if (error.response?.status === 404) {
                errorMessage = ` *「❌」 NO ENCONTRADO*\n\n` +
                              `> El repositorio no existe o es privado\n` +
                              `> Verifica la URL, mi amor`;
            } else if (error.message.includes('timeout')) {
                errorMessage = ` *「⏳」 TIMEOUT*\n\n` +
                              `> La descarga tardó demasiado\n` +
                              `> Intenta con un repositorio más pequeño`;
            }

            await sock.sendMessage(jid, {
                text: errorMessage
            }, { quoted: message });
        } finally {
            // Liberar al usuario de las descargas activas
            activeDownloads.delete(userNumber);
        }
    }
};