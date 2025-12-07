const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['disable_modoadmin', 'disablemodoadmin', 'desactivar_modoadmin', 'modoadmin_off'],
    description: 'Desactivar modo solo administradores',
    isGroup: true,
    isPrivate: false,
    isAdmin: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Verificar si el usuario es administrador
            const metadata = await sock.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === sender);

            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
                // 1. MENSAJE DE PERMISO REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Solo Admins.' 
                }, { quoted: message });
                return;
            }

            // Crear instancia del gestor de grupos
            const gestorGrupos = new GestorGrupos();

            // Verificar estado actual
            const modoActual = await gestorGrupos.obtenerModoAdmin(jid);
            
            if (!modoActual) {
                // 2. MENSAJE YA DESACTIVADO REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '⚠️ Modo Admin ya está OFF. Usa *.enable_modoadmin* para activar.'
                }, { quoted: message });
                return;
            }

            // Desactivar modo admin
            const desactivado = await gestorGrupos.desactivarModoAdmin(jid);
            
            if (!desactivado) {
                throw new Error('No se pudo desactivar el modo admin');
            }

            // 3. MENSAJE DE CONFIRMACIÓN REDUCIDO Y ETIQUETADO
            await sock.sendMessage(jid, { 
                text: `✅ Modo Admin *DESACTIVADO*. Todos los comandos disponibles.`,
            }, { quoted: message });

            Logger.info(`✅ Modo admin DESACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('❌ Error en disable_modoadmin:', error);
            
            try {
                // 4. MENSAJE DE ERROR REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Error al desactivar el modo admin.'
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};