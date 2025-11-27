const Logger = require('../../utils/logger');

module.exports = {
    command: ['fotogrupo', 'grouppic', 'gpic'],
    description: 'Descargar foto de perfil del grupo',
    isOwner: false,
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Obtener la foto de perfil del grupo
            const profilePicture = await sock.profilePictureUrl(jid, 'image');

            if (!profilePicture) {
                await sock.sendMessage(jid, { 
                    text: '❌ *Este grupo no tiene foto de perfil*' 
                });
                return;
            }

            // Enviar la imagen
            await sock.sendMessage(jid, {
                image: { url: profilePicture },
                caption: '📸 *Foto de perfil del grupo*'
            });

            Logger.info(`✅ Foto de grupo descargada en ${jid}`);

        } catch (error) {
            Logger.error('Error en comando grouppic:', error);

            await sock.sendMessage(jid, { 
                text: '❌ *Error al obtener la foto del grupo*\n\nEl grupo puede no tener foto de perfil.' 
            });
        }
    }
};