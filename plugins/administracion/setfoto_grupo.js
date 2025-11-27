const Logger = require('../../utils/logger');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    command: ['setpp', 'setfoto', 'cambiarfoto'],
    description: 'Cambiar foto de perfil del grupo (Solo Admins)',
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        
        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);
            
            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Este comando solo es para administradores.' 
                }, { quoted: message });
            }

            // Verificar si el mensaje es una respuesta a una imagen
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quotedMessage?.imageMessage) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Responde a una imagen* con el comando.\n*Ejemplo:* Responde a una foto con .setpp' 
                }, { quoted: message });
            }

            const imageMessage = quotedMessage.imageMessage;

            // Descargar la imagen
            const stream = await downloadContentFromMessage(imageMessage, 'image');
            const bufferChunks = [];
            
            for await (const chunk of stream) {
                bufferChunks.push(chunk);
            }
            
            const imageBuffer = Buffer.concat(bufferChunks);

            // Cambiar la foto del grupo
            await sock.updateProfilePicture(jid, imageBuffer);

            await sock.sendMessage(jid, { 
                text: '✅ *Foto del grupo actualizada*' 
            }, { quoted: message });

            Logger.info(`✅ Foto de grupo cambiada en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en comando setpp:', error);
            
            let mensajeError = '❌ Error al cambiar la foto del grupo.';
            
            if (error.message.includes('not authorized')) {
                mensajeError = '❌ No tengo permisos para cambiar la foto.';
            } else if (error.message.includes('media download')) {
                mensajeError = '❌ Error al descargar la imagen.';
            } else if (error.message.includes('rejected')) {
                mensajeError = '❌ La foto fue rechazada (muy pesada o formato inválido).';
            }

            try {
                await sock.sendMessage(jid, { 
                    text: mensajeError 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};