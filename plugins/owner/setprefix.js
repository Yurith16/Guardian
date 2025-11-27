const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    command: ['setprefix', 'cambiarprefijo'],
    description: 'Cambiar prefijo global del bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si es el owner global
            const Config = require('../../config/bot.json');
            const globalOwner = Config.propietarios.global;
            const senderNumber = sender.split('@')[0];
            const senderId = sender;

            if (typeof globalOwner === 'object') {
                if (senderNumber !== globalOwner.numero && senderId !== globalOwner.id) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Solo el owner global puede usar este comando.' 
                    }, { quoted: message });
                }
            } else {
                if (senderNumber !== globalOwner) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Solo el owner global puede usar este comando.' 
                    }, { quoted: message });
                }
            }

            // Verificar si se proporcionó nuevo prefijo
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .setprefix <nuevo prefijo>\n\n💡 *Ejemplos:*\n.setprefix !\n.setprefix $\n.setprefix .\n\n⚠️ *Recomendación:* Usa prefijos únicos para evitar conflictos.' 
                }, { quoted: message });
            }

            const nuevoPrefijo = args[0].trim();

            // Validar el nuevo prefijo
            if (nuevoPrefijo.length > 3) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El prefijo no puede tener más de 3 caracteres.' 
                }, { quoted: message });
            }

            if (nuevoPrefijo.includes(' ') || nuevoPrefijo.includes('\n')) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El prefijo no puede contener espacios o saltos de línea.' 
                }, { quoted: message });
            }

            // Caracteres peligrosos a evitar
            const caracteresPeligrosos = ['/', '\\', '@', '#', '&', '|', ';', '`', '$', '(', ')', '[', ']', '{', '}'];
            if (caracteresPeligrosos.some(char => nuevoPrefijo.includes(char))) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El prefijo contiene caracteres no permitidos.' 
                }, { quoted: message });
            }

            const prefijoAnterior = Config.bot.prefix;

            // Cargar y actualizar configuración
            const configPath = path.join(__dirname, '../../config/bot.json');
            const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));

            // Actualizar prefijo
            configData.bot.prefix = nuevoPrefijo;

            // Guardar cambios
            await fs.writeFile(configPath, JSON.stringify(configData, null, 2));

            await sock.sendMessage(jid, { 
                text: `✅ *PREFIJO ACTUALIZADO*\n\n🔄 *Anterior:* ${prefijoAnterior}\n🎯 *Nuevo:* ${nuevoPrefijo}\n\n⚠️ *Reinicia el bot para aplicar los cambios*\n\n💡 *Comandos afectados:*\nTodos los comandos usarán: ${nuevoPrefijo}comando` 
            }, { quoted: message });

            Logger.info(`✅ Prefijo cambiado de "${prefijoAnterior}" a "${nuevoPrefijo}" por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setprefix:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al cambiar el prefijo.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};