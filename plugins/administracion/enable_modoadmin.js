const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['enable_modoadmin', 'enable_admin', 'activar_modoadmin', 'modoadmin_on'],
    description: 'Activar modo solo administradores',
    isGroup: true,
    isPrivate: false,
    isAdmin: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const adminNumero = sender.split('@')[0];

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
            
            if (modoActual) {
                // 2. MENSAJE YA ACTIVADO REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '⚠️ Modo Admin ya está ON. Usa *.disable_modoadmin* para desactivar.'
                }, { quoted: message });
                return;
            }

            // Activar modo admin
            const activado = await gestorGrupos.activarModoAdmin(jid);
            
            if (!activado) {
                throw new Error('No se pudo activar el modo admin');
            }
            
            // 3. MENSAJE DE CONFIRMACIÓN REDUCIDO Y ETIQUETADO
            await sock.sendMessage(jid, { 
                text: `✅ Modo Admin *ACTIVADO* por @${adminNumero}. Solo Admins pueden usar comandos.`,
                mentions: [sender]
            }, { quoted: message });

            Logger.info(`✅ Modo admin ACTIVADO en ${jid} por ${sender}`);

        } catch (error) {
            Logger.error('❌ Error en enable_modoadmin:', error);
            
            try {
                // 4. MENSAJE DE ERROR REDUCIDO
                await sock.sendMessage(jid, { 
                    text: '❌ Error al activar modo admin.'
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};