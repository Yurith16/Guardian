const Logger = require('../../utils/logger');

module.exports = {
    command: ['ping', 'latencia'],
        description: 'Ver latencia del bot',
        isOwner: false,
        isGroup: true,      // ✅ Grupos
        isPrivate: true,  

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const start = Date.now();

        try {
            const msg = await sock.sendMessage(jid, { 
                text: '🏓 *Calculando ping...*' 
            }, { quoted: message });

            const end = Date.now();
            const latency = end - start;

            await sock.sendMessage(jid, { 
                text: `🏓 *PONG!*\n⏱️ Latencia: ${latency}ms` 
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en ping:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error en ping' 
            }, { quoted: message });
        }
    }
};