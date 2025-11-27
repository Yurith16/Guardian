const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['setbye', 'setdespedida'],
    description: 'Configurar mensaje de despedida personalizado',
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
                    text: '❌ Solo administradores.' 
                }, { quoted: message });
            }

            // Verificar si se proporcionó texto
            if (args.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Uso: .setbye <texto>\n\n💡 Variables disponibles:\n• @user - Menciona al usuario\n• %group% - Nombre del grupo\n• %membercount% - Total de miembros\n\n📝 Ejemplo:\n.setbye @user ha abandonado %group% 👋' 
                }, { quoted: message });
            }

            const texto = args.join(' ');

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);

            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
            }

            // Configurar despedida personalizada
            if (!datosGrupo.configuraciones) datosGrupo.configuraciones = {};
            datosGrupo.configuraciones.byeMessage = texto;
            datosGrupo.configuraciones.despedidas = true;

            await gestorGrupos.guardarDatos(jid, datosGrupo);

            await sock.sendMessage(jid, { 
                text: `✅ *DESPEDIDA CONFIGURADA*\n\n📝 Mensaje:\n${texto}\n\n💡 Se mostrará cuando miembros abandonen el grupo.` 
            }, { quoted: message });

            Logger.info(`✅ Despedida configurada en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en setbye:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al configurar despedida' 
            }, { quoted: message });
        }
    }
};