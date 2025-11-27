const Logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['imgmenu', 'setmenuimg', 'cambiarmenu'],
    description: 'Cambiar imagen del menú (Solo Owner)',
    isOwner: true,
    isGroup: false,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const url = args[0];

        // ✅ VERIFICACIÓN DE PERMISOS
        if (!ManejadorPropietarios.esOwner(sender)) {
            Logger.warn(`🚫 Intento de uso no autorizado de .imgmenu por: ${sender}`);
            return await sock.sendMessage(jid, { 
                text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
            }, { quoted: message });
        }

        if (!url) {
            await sock.sendMessage(jid, {
                text: '❌ *Ingresa una URL de imagen*\n\nEjemplo: *imgmenu https://ejemplo.com/imagen.jpg*\n\n💡 *Comando adicional:*\n.imgmenu reset - Restablecer imagen por defecto'
            }, { quoted: message });
            return;
        }

        // Opción para resetear
        if (url.toLowerCase() === 'reset') {
            return await this.resetearImagen(sock, message);
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

            // ✅ CREAR ARCHIVO DE CONFIGURACIÓN SEPARADO
            const configDir = path.join(__dirname, '../../config');
            const menuImageConfigPath = path.join(configDir, 'menu_images.json');

            // Crear configuración
            const menuConfig = {
                customImage: url,
                lastUpdated: new Date().toISOString(),
                updatedBy: sender
            };

            // Asegurar que existe la carpeta config
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // Guardar configuración
            fs.writeFileSync(menuImageConfigPath, JSON.stringify(menuConfig, null, 2));

            await sock.sendMessage(jid, {
                react: { text: "✅", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: `✅ *Imagen del menú actualizada*\n\n🖼️ *Nueva imagen:* ${url}\n⏰ *Fecha:* ${new Date().toLocaleString()}\n👤 *Configurado por:* ${sender.split('@')[0]}\n\nEl cambio se aplicará en el próximo uso del menú.`
            }, { quoted: message });

            Logger.info(`🖼️ Imagen del menú cambiada por ${sender}: ${url}`);

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
            }

            await sock.sendMessage(jid, {
                text: errorMsg
            }, { quoted: message });
        }
    },

    async resetearImagen(sock, message) {
        const jid = message.key.remoteJid;
        const configPath = path.join(__dirname, '../../config/menu_images.json');

        try {
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            await sock.sendMessage(jid, {
                react: { text: "🔄", key: message.key }
            });

            await sock.sendMessage(jid, {
                text: '✅ *Imagen del menú restablecida*\n\nSe usarán las imágenes por defecto en el próximo menú.'
            }, { quoted: message });

            Logger.info('🖼️ Imagen del menú restablecida por defecto');
        } catch (error) {
            Logger.error('Error resetando imagen:', error);
            await sock.sendMessage(jid, {
                text: '❌ Error al restablecer la imagen.'
            }, { quoted: message });
        }
    }
};