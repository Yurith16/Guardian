const Logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['setowner', 'addowner'],
    description: 'Añadir nuevo propietario al bot (Solo Owner Global)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS - Solo owners globales pueden agregar owners
            if (!ManejadorPropietarios.esPropietarioGlobal(sender)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .setowner por: ${sender}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios globales pueden agregar nuevos owners.' 
                }, { quoted: message });
            }

            // Verificar si se proporcionaron ambos parámetros
            if (args.length < 2) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso:* .setowner <número> <id>\n*Ejemplo:* .setowner 50499001122 50499001122@s.whatsapp.net\n\n💡 *Para obtener el ID:*\nEl usuario debe usar .myid en el grupo' 
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
            if (!id.includes('@s.whatsapp.net') && !id.includes('@lid')) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Formato inválido del ID.*\nDebe incluir @s.whatsapp.net o @lid\n*Ejemplo:* 50499001122@s.whatsapp.net' 
                }, { quoted: message });
            }

            // Verificar si ya es owner
            if (ManejadorPropietarios.esOwner(numero) || ManejadorPropietarios.esOwner(id)) {
                return await sock.sendMessage(jid, { 
                    text: '✅ Este usuario ya es propietario del bot.' 
                }, { quoted: message });
            }

            const nuevoOwner = {
                numero: numero,
                id: id
            };

            // Cargar y actualizar configuración
            const configPath = path.join(__dirname, '../../config/bot.json');
            const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));

            // Verificar y crear estructura si no existe
            if (!configData.propietarios) {
                configData.propietarios = {};
            }
            if (!Array.isArray(configData.propietarios.global)) {
                configData.propietarios.global = [];
            }

            // Agregar nuevo owner al array
            configData.propietarios.global.push(nuevoOwner);

            // Guardar cambios
            await fs.writeFile(configPath, JSON.stringify(configData, null, 2));

            // Recargar el manejador de propietarios
            ManejadorPropietarios.recargar();

            await sock.sendMessage(jid, { 
                text: `✅ *Nuevo Owner Agregado*\n\n📱 *Número:* ${numero}\n🆔 *ID:* ${id}\n👥 *Total de Owners:* ${configData.propietarios.global.length}\n\n⚠️ *Los cambios se aplicaron automáticamente*` 
            }, { quoted: message });

            Logger.info(`✅ Nuevo owner agregado: ${numero} (${id}) por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setowner:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al agregar el owner.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};