const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['byemsg', 'despedida'],
    description: 'Activar/desactivar mensajes de despedida',
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

            const accion = args[0]?.toLowerCase();
            if (!accion || !['on', 'off', 'activar', 'desactivar'].includes(accion)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Uso: .byemsg on/off\n\n💡 Ejemplos:\n.byemsg on - Activar despedidas\n.byemsg off - Desactivar despedidas' 
                }, { quoted: message });
            }

            const activar = ['on', 'activar'].includes(accion);

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);

            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
            }

            // Actualizar configuración
            if (!datosGrupo.configuraciones) datosGrupo.configuraciones = {};
            datosGrupo.configuraciones.despedidas = activar;

            await gestorGrupos.guardarDatos(jid, datosGrupo);

            const estado = activar ? 'activadas' : 'desactivadas';
            const emoji = activar ? '🟢' : '🔴';

            await sock.sendMessage(jid, { 
                text: `${emoji} *DESPEDIDAS ${activar ? 'ACTIVADAS' : 'DESACTIVADAS'}*\n\n${activar ? '✅ Se enviarán mensajes cuando miembros abandonen el grupo.' : '❌ No se enviarán mensajes de despedida.'}` 
            }, { quoted: message });

            Logger.info(`✅ Despedidas ${estado} en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en byemsg:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al cambiar configuración' 
            }, { quoted: message });
        }
    }
};