const Logger = require('../../utils/logger');

module.exports = {
    command: ['leave', 'salir', 'fuera', 'salte'],
    description: 'Hacer que el bot salga del grupo (Solo Owner y Admins)',
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si el usuario es administrador o owner
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);

            const esAdmin = participant && ['admin', 'superadmin'].includes(participant.admin);
            const esOwner = await this.esOwner(sender);

            if (!esAdmin && !esOwner) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo administradores y el owner pueden usar este comando.' 
                }, { quoted: message });
            }

            // Obtener nombre del grupo para el mensaje
            const groupName = metadata.subject || 'este grupo';

            // Enviar mensaje de despedida
            await sock.sendMessage(jid, { 
                text: `👋 *Me despido de ${groupName}*\n\n¡Hasta pronto! 🛡️` 
            });

            // Esperar un momento antes de salir
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Salir del grupo
            await sock.groupLeave(jid);

            Logger.info(`✅ Bot salió del grupo ${jid} por solicitud de ${sender}`);

        } catch (error) {
            Logger.error('Error en comando leave:', error);
            Logger.error('Detalles del error:', error.message);

            try {
                // Intentar salir de forma alternativa si falla el método principal
                await sock.groupLeave(jid).catch(async () => {
                    // Si falla, enviar mensaje de error
                    await sock.sendMessage(jid, { 
                        text: '❌ Error al salir del grupo. Intentando método alternativo...' 
                    }, { quoted: message });
                });
            } catch (finalError) {
                Logger.error('Error final en comando leave:', finalError);

                try {
                    await sock.sendMessage(jid, { 
                        text: '❌ No se pudo salir del grupo. Contacta al owner.' 
                    }, { quoted: message });
                } catch (sendError) {
                    Logger.error('Error enviando mensaje final:', sendError);
                }
            }
        }
    },

    // Función para verificar si es owner
    async esOwner(sender) {
        try {
            const Config = require('../../config/bot.json');
            const globalOwner = Config.propietarios.global;
            const subOwners = Config.propietarios.subOwners || [];
            const senderNumber = sender.split('@')[0];
            const senderId = sender;

            // Verificar owner global
            if (typeof globalOwner === 'object') {
                if (senderNumber === globalOwner.numero || senderId === globalOwner.id) {
                    return true;
                }
            } else {
                if (senderNumber === globalOwner) {
                    return true;
                }
            }

            // Verificar sub-owners
            for (const owner of subOwners) {
                if (typeof owner === 'object') {
                    if (senderNumber === owner.numero || senderId === owner.id) {
                        return true;
                    }
                } else {
                    if (senderNumber === owner) {
                        return true;
                    }
                }
            }

            return false;

        } catch (error) {
            Logger.debug('Error verificando owner:', error.message);
            return false;
        }
    }
};