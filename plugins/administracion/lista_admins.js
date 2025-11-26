const Logger = require('../../utils/logger');

module.exports = {
    command: ['admins', 'administradores'],
    description: 'Listar administradores del grupo',
    isOwner: false,
    isAdmin: false,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            const groupInfo = await sock.groupMetadata(jid);
            const admins = groupInfo.participants.filter(p => p.admin);

            if (admins.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '👑 *No hay administradores*' 
                }, { quoted: message });
            }

            let listaAdmins = '👑 *ADMINISTRADORES*\n\n';
            admins.forEach((admin, index) => {
                const numero = admin.id.split('@')[0];
                const tipo = admin.admin === 'superadmin' ? '👑 Creador' : '⚡ Admin';
                listaAdmins += `${index + 1}. @${numero} - ${tipo}\n`;
            });

            await sock.sendMessage(jid, { 
                text: listaAdmins,
                mentions: admins.map(a => a.id)
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en admins:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al listar admins' 
            }, { quoted: message });
        }
    }
};