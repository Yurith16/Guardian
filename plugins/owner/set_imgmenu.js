const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');
const fs = require('fs');
const path = require('path');

module.exports = {
    command: ['imgmenu', 'setmenuimg', 'cambiarmenu'],
    description: 'Cambiar imagen del menú (Solo Owner)',
    isOwner: true,
    isGroup: false,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const url = args[0];

        if (!url) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa una URL de imagen*\n\nEjemplo: *imgmenu https://ejemplo.com/imagen.jpg*'
            }, { quoted: message });
            return;
        }

        // Validar que sea una URL válida
        if (!url.startsWith('http')) {
            await sock.sendMessage(jid, {
                text: '❌ *URL no válida*\n\nLa URL debe comenzar con http:// o https://'
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: "⏳", key: message.key }
            });

            // Verificar que la URL sea accesible
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error('No se puede acceder a la imagen');
            }

            // Verificar que sea una imagen
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error('La URL no apunta a una imagen válida');
            }

            // Actualizar la configuración del menú
            const menuConfigPath = path.join(__dirname, 'menu.js');
            let menuCode = fs.readFileSync(menuConfigPath, 'utf8');

            // Reemplazar todas las URLs existentes por la nueva URL única
            menuCode = menuCode.replace(
                /const menuImages = \[[^\]]*\];/,
                `const menuImages = [\n    "${url}"\n];`
            );

            // Eliminar backupImages para usar solo una imagen
            menuCode = menuCode.replace(
                /const backupImages = \[[^\]]*\];/,
                `const backupImages = [\n    "${url}"\n];`
            );

            // Sobrescribir el archivo del menú
            fs.writeFileSync(menuConfigPath, menuCode, 'utf8');

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: `✅ *Imagen del menú actualizada*\n\nNueva imagen: ${url}\n\nEl cambio se aplicará en el próximo uso del menú.`
            }, { quoted: message });

            Logger.info(`🖼️ Imagen del menú cambiada por owner: ${url}`);

        } catch (error) {
            console.error('Error en comando imgmenu:', error);

            await sock.sendMessage(jid, {
                react: { text: "❌", key: message.key }
            });

            let errorMsg = '❌ *Error al cambiar la imagen*';

            if (error.message.includes('No se puede acceder')) {
                errorMsg = '❌ *No se puede acceder a la imagen*\n\nVerifica que la URL sea pública y accesible.';
            } else if (error.message.includes('no apunta a una imagen')) {
                errorMsg = '❌ *URL no es una imagen válida*\n\nLa URL debe apuntar a una imagen (JPG, PNG, etc.).';
            } else if (error.message.includes('ENOENT')) {
                errorMsg = '❌ *Error de archivo*\n\nNo se pudo modificar la configuración del menú.';
            }

            await sock.sendMessage(jid, {
                text: errorMsg
            }, { quoted: message });
        }
    }
};