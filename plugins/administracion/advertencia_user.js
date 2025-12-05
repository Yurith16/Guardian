const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['warn', 'advertir'],
    description: 'Advertir a usuario (3 advertencias = expulsión)',
        isGroup: true,      // ✅ Solo grupos
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

            // Verificar mención
            if (!message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Menciona al usuario.\nEj: .warn @usuario razón' 
                }, { quoted: message });
            }

            const userJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            const razon = args.slice(1).join(' ') || 'Sin razón especificada';

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);

            if (!datosGrupo) {
                datosGrupo = await gestorGrupos.inicializarGrupo(jid, metadata);
            }

            // Inicializar sistema de advertencias si no existe
            if (!datosGrupo.advertencias) {
                datosGrupo.advertencias = {};
            }

            // Inicializar advertencias del usuario
            if (!datosGrupo.advertencias[userJid]) {
                datosGrupo.advertencias[userJid] = {
                    count: 0,
                    historial: []
                };
            }

            // Agregar advertencia
            datosGrupo.advertencias[userJid].count++;
            datosGrupo.advertencias[userJid].historial.push({
                fecha: new Date().toISOString(),
                razon: razon,
                admin: sender
            });

            // Guardar cambios
            await gestorGrupos.guardarDatos(jid, datosGrupo);

            const advertenciasActuales = datosGrupo.advertencias[userJid].count;
            const advertenciasRestantes = 3 - advertenciasActuales;

            let mensaje = `⚠️ *ADVERTENCIA #${advertenciasActuales}*\n` +
                         `👤 @${userJid.split('@')[0]}\n` +
                         `📝 ${razon}\n` +
                         `⏰ Admin: @${sender.split('@')[0]}\n\n`;

            if (advertenciasActuales >= 3) {
                // Expulsar usuario por 3 advertencias
                await sock.groupParticipantsUpdate(jid, [userJid], 'remove');
                mensaje += `🚫 *USUARIO EXPULSADO* (3/3 advertencias)`;

                // Limpiar advertencias después de expulsar
                delete datosGrupo.advertencias[userJid];
                await gestorGrupos.guardarDatos(jid, datosGrupo);

                Logger.info(`✅ Usuario expulsado por 3 advertencias: ${userJid} en ${jid}`);
            } else {
                mensaje += `📊 ${advertenciasActuales}/3 advertencias\n` +
                          `⚠️ Le quedan ${advertenciasRestantes} advertencias`;
            }

            await sock.sendMessage(jid, { 
                text: mensaje,
                mentions: [userJid, sender]
            }, { quoted: message });

        } catch (error) {
            Logger.error('Error en warn:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al advertir' 
            }, { quoted: message });
        }
    }
};