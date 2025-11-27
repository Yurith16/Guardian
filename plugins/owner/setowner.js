const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    command: ['setowner', 'addowner'],
    description: 'Cambiar o añadir propietario (Solo Owner Global)',
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

            // Verificar si se proporcionaron ambos parámetros
            if (args.length < 2) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .setowner <número> <id>\n*Ejemplo:* .setowner 50499001122 20015168381136@lid\n\n💡 *Para obtener el ID:*\nEl usuario debe usar .myid en el grupo' 
                }, { quoted: message });
            }

            const numero = args[0].trim();
            const id = args[1].trim();

            // Validar formato del número
            if (!/^\d{8,15}$/.test(numero)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Formato inválido del número.*\nDebe incluir código de país.\n*Ejemplo:* 50499001122' 
                }, { quoted: message });
            }

            // Validar formato del ID
            if (!id.includes('@')) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Formato inválido del ID.*\nDebe incluir @lid o @s.whatsapp.net\n*Ejemplo:* 20015168381136@lid' 
                }, { quoted: message });
            }

            const nuevoOwner = {
                numero: numero,
                id: id
            };

            // Cargar y actualizar configuración
            const configPath = path.join(__dirname, '../../config/bot.json');
            const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));

            // Actualizar owner global
            configData.propietarios.global = nuevoOwner;

            // Guardar cambios
            await fs.writeFile(configPath, JSON.stringify(configData, null, 2));

            await sock.sendMessage(jid, { 
                text: `✅ *Owner actualizado*\n\n📱 Número: ${numero}\n🆔 ID: ${id}\n\n⚠️ *Reinicia el bot para aplicar los cambios*` 
            }, { quoted: message });

            Logger.info(`✅ Owner cambiado a ${numero} (${id}) por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setowner:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al cambiar el owner.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};