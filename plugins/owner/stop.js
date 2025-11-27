const Logger = require('../../utils/logger');

module.exports = {
    command: ['stop', 'detener', 'parar', 'apagar', 'shutdown'],
    description: 'Apagar el bot (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            // Enviar mensaje de confirmación
            await sock.sendMessage(jid, { 
                text: '🛑 *Apagando Guardian Bot...*\n\n¡Hasta pronto! 👋' 
            }, { quoted: message });

            Logger.info(`🛑 Apagado solicitado por ${jid}`);

            // Cerrar conexión limpiamente
            if (sock && sock.ws) {
                try {
                    await sock.ws.close();
                } catch (closeError) {
                    Logger.debug('Error cerrando conexión:', closeError);
                }
            }

            // Salir del proceso después de un breve delay
            setTimeout(() => {
                Logger.info('✅ Bot apagado correctamente');
                process.exit(0);
            }, 2000);

        } catch (error) {
            Logger.error('Error en comando stop:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al apagar el bot.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};