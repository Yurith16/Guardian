const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');

// Función auxiliar para mostrar información del grupo
async function mostrarInfoGrupo(sock, message, jid) {
    try {
        const groupInfo = await sock.groupMetadata(jid);
        const participants = groupInfo.participants;
        const admins = participants.filter(p => p.admin).length;

        const infoMsg = `📊 *INFORMACIÓN DEL GRUPO*

🏷️ *Nombre:* ${groupInfo.subject}
👥 *Miembros:* ${participants.length}
👑 *Administradores:* ${admins}
🔒 *Estado:* ${groupInfo.announce ? 'Cerrado 🔒' : 'Abierto ✅'}
🆔 *ID:* ${groupInfo.id.substring(0, 10)}...`;

        await sock.sendMessage(jid, { text: infoMsg }, { quoted: message });

    } catch (error) {
        Logger.error('Error obteniendo info del grupo:', error);
        await sock.sendMessage(jid, { 
            text: '❌ No se pudo obtener la información del grupo.' 
        }, { quoted: message });
    }
}

module.exports = {
    command: ['grupo', 'group'],
        description: 'Configuración del grupo',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            if (!args[0]) {
                // Mostrar información del grupo por defecto
                return await mostrarInfoGrupo(sock, message, jid);
            }

            const subcomando = args[0].toLowerCase();

            switch (subcomando) {
                case 'abrir':
                case 'open':
                    await sock.groupSettingUpdate(jid, 'not_announcement');
                    await sock.sendMessage(jid, { text: '✅ Grupo abierto' }, { quoted: message });
                    break;

                case 'cerrar':
                case 'close':
                    await sock.groupSettingUpdate(jid, 'announcement');
                    await sock.sendMessage(jid, { text: '🔒 Grupo cerrado' }, { quoted: message });
                    break;

                case 'info':
                    await mostrarInfoGrupo(sock, message, jid);
                    break;

                default:
                    await sock.sendMessage(jid, { 
                        text: `💡 Uso: ${Config.bot.prefix}grupo [abrir|cerrar|info]` 
                    }, { quoted: message });
            }

        } catch (error) {
            Logger.error('Error en comando grupo:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al configurar el grupo.' 
            }, { quoted: message });
        }
    }
};