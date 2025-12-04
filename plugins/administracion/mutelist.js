const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['mutelist', 'silenciados', 'lista_mute'],
    description: 'Mostrar lista de usuarios silenciados',
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
                return await sock.sendMessage(jid, { 
                    text: '❌ Solo administradores pueden usar este comando.' 
                }, { quoted: message });
            }

            const gestorGrupos = new GestorGrupos();
            const usuariosSilenciados = await gestorGrupos.obtenerUsuariosSilenciados(jid);

            if (usuariosSilenciados.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '✅ No hay usuarios silenciados en este grupo.' 
                }, { quoted: message });
            }

            let texto = `📋 *Usuarios Silenciados* (${usuariosSilenciados.length})\n\n`;
            const menciones = [];

            usuariosSilenciados.forEach((usuario, index) => {
                texto += `${index + 1}. @${usuario.numero}\n`;
                texto += `   ⏱️ Tiempo restante: ${usuario.tiempo_restante} minutos\n`;
                texto += `   📝 Razón: ${usuario.razon}\n`;
                texto += `   🕐 Silenciado: ${new Date(usuario.fecha_silenciado).toLocaleTimeString()}\n\n`;
                
                menciones.push(usuario.usuario_id);
            });

            await sock.sendMessage(jid, { 
                text: texto,
                mentions: menciones
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en comando mutelist:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al obtener lista de silenciados.' 
            }, { quoted: message });
        }
    }
};