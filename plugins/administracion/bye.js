const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['despedida', 'welcome'],
    description: 'Activar/desactivar mensajes de despedida',
        isGroup: true,      // ✅ Solo grupos
        isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);

            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                // 1. MENSAJE DE PERMISO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo Admins.' 
                }, { quoted: message });
            }

            const accion = args[0]?.toLowerCase();
            if (!accion || !['on', 'off', 'activar', 'desactivar'].includes(accion)) {
                // 2. MENSAJE DE USO REDUCIDO
                return await sock.sendMessage(jid, { 
                    text: '❌ Uso incorrecto. Usa: .byemsg on/off' 
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

            // 3. MENSAJE DE CONFIRMACIÓN REDUCIDO
            await sock.sendMessage(jid, { 
                text: `${emoji} Despedidas *${estado.toUpperCase()}*` 
            }, { quoted: message });

            Logger.info(`✅ Despedidas ${estado} en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('Error en byemsg:', error);
            // 4. MENSAJE DE ERROR REDUCIDO
            await sock.sendMessage(jid, { 
                text: '❌ Error al cambiar configuración' 
            }, { quoted: message });
        }
    }
};