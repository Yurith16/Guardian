const { search, download } = require('aptoide-scraper');

const Logger = require('../../utils/logger');

// Comando principal
module.exports = {
    command: ['apk', 'apkmod', 'modapk', 'aptoide', 'aptoidedl'],
    description: 'Buscar y descargar APKs desde Aptoide',
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
                    text: '❌ Ingresa nombre de la aplicación.\n💡 Ejemplo: .apk WhatsApp'
                }, { quoted: message });
                return;
            }

            // Reacción de búsqueda
            await sock.sendMessage(jid, {
                react: { text: "🔍", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: `🔍 Buscando aplicación: ${query}`
            }, { quoted: message });

            // Buscar en Aptoide
            const searchResults = await search(query);
            
            if (!searchResults || searchResults.length === 0) {
                throw new Error('Aplicación no encontrada');
            }

            // Obtener datos de la primera aplicación
            const appData = await download(searchResults[0].id);
            
            if (!appData || !appData.dllink) {
                throw new Error('No se pudo obtener enlace de descarga');
            }

            // Mostrar información de la aplicación
            const infoMessage = `📱 *INFORMACIÓN DE LA APLICACIÓN*\n\n` +
                               `📌 *Nombre:* ${appData.name}\n` +
                               `📦 *Paquete:* ${appData.package}\n` +
                               `📅 *Actualizado:* ${appData.lastup}\n` +
                               `💾 *Tamaño:* ${appData.size}\n` +
                               `⭐ *Rating:* ${appData.rating || 'N/A'}\n` +
                               `⬇️ *Descargando APK...*`;

            await sock.sendMessage(jid, {
                image: { url: appData.icon || 'https://static-00.iconduck.com/assets.00/android-icon-2048x2048-pwwaxqjq.png' },
                caption: infoMessage
            }, { quoted: message });

            // Verificar tamaño (no enviar si es muy grande)
            if (appData.size.includes('GB') || (appData.size.includes('MB') && 
                parseInt(appData.size.replace(' MB', '')) > 999)) {
                
                await sock.sendMessage(jid, { 
                    text: `⚠️ *APK demasiado grande*\n\n` +
                          `La aplicación pesa ${appData.size} y no puede ser enviada.\n` +
                          `Descarga manual desde: ${appData.dllink}`
                }, { quoted: message });
                return;
            }

            // Descargar y enviar APK
            const response = await fetch(appData.dllink);
            
            if (!response.ok) {
                throw new Error('Error al descargar APK');
            }

            const apkBuffer = Buffer.from(await response.arrayBuffer());
            
            // Enviar APK como documento
            await sock.sendMessage(jid, {
                document: apkBuffer,
                fileName: `${appData.name.replace(/[\\/:*?"<>|]/g, '_')}.apk`,
                mimetype: 'application/vnd.android.package-archive',
                caption: `📱 ${appData.name}\n⚡ Guardian Bot`
            }, { quoted: message });

            // Reacción de éxito
            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            Logger.info(`✅ APK descargado: "${appData.name}" - ${appData.size}`);

        } catch (error) {
            Logger.error('Error en comando APK:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            await sock.sendMessage(jid, { 
                text: '❌ No se pudo descargar la aplicación.'
            }, { quoted: message });
        }
    }
};