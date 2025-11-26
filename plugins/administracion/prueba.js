const Logger = require('../../utils/logger');

module.exports = {
    command: ['prueba', 'test'],
    description: 'Comando de prueba para administración',

    async execute(sock, message, args) {
        try {
            const jid = message.key.remoteJid;

            await sock.sendMessage(jid, { 
                text: '✅ *Módulo de administración funcionando correctamente*\n\nEste es un comando de prueba. Los comandos de moderación estarán disponibles pronto.' 
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en comando prueba:', error);
        }
    }
};