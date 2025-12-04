const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['mute', 'silenciar'],
    description: 'Silenciar usuario temporalmente',
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

            // Verificar mención
            const mencionJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            
            if (!mencionJid || mencionJid.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Menciona al usuario.\nEj: .mute @usuario\nEj: .mute @usuario 10 (minutos)\nEj: .mute @usuario 5 spam' 
                }, { quoted: message });
            }

            const userJid = mencionJid[0];
            
            // Verificar que no se mutee a sí mismo
            if (userJid === sender) {
                return await sock.sendMessage(jid, { 
                    text: '❌ No puedes silenciarte a ti mismo.' 
                }, { quoted: message });
            }

            // Verificar que no se mutee a otro admin
            const userParticipant = metadata.participants.find(p => p.id === userJid);
            if (userParticipant && ['admin', 'superadmin'].includes(userParticipant.admin)) {
                return await sock.sendMessage(jid, { 
                    text: '❌ No puedes silenciar a otro administrador.' 
                }, { quoted: message });
            }

            // Obtener duración (por defecto 5 minutos)
            let duracion = 5;
            let razon = 'Sin razón específica';

            if (args.length > 0) {
                // Intentar extraer duración numérica
                const duracionMatch = args.join(' ').match(/(\d+)/);
                if (duracionMatch) {
                    duracion = parseInt(duracionMatch[1]);
                    // Limitar duración máxima a 60 minutos
                    if (duracion > 60) duracion = 60;
                    if (duracion < 1) duracion = 1;
                    
                    // Extraer razón
                    razon = args.join(' ').replace(duracionMatch[0], '').trim();
                    if (!razon || razon === '') razon = 'Sin razón específica';
                } else {
                    razon = args.join(' ');
                }
            }

            // Obtener gestor de grupos
            const gestorGrupos = new GestorGrupos();
            
            // Verificar si ya está silenciado
            const yaSilenciado = await gestorGrupos.verificarSilenciado(jid, userJid);
            if (yaSilenciado && yaSilenciado.silenciado) {
                return await sock.sendMessage(jid, { 
                    text: `❌ @${userJid.split('@')[0]} ya está silenciado.\nTiempo restante: ${yaSilenciado.tiempo_restante} minutos`,
                    mentions: [userJid]
                }, { quoted: message });
            }

            // Silenciar usuario
            const resultado = await gestorGrupos.silenciarUsuario(jid, userJid, duracion, razon);
            
            if (resultado) {
                // Actualizar quién silenció
                await gestorGrupos.actualizarSilenciadoPor(jid, userJid, sender);

                await sock.sendMessage(jid, { 
                    text: `✅ @${userJid.split('@')[0]} silenciado por ${duracion} minutos.\nRazón: ${razon}\n\nEl usuario no podrá enviar mensajes hasta que expire el silencio.`,
                    mentions: [userJid]
                }, { quoted: message });

                Logger.info(`✅ Usuario ${userJid} silenciado por ${duracion} minutos en ${jid} por ${sender}`);
            } else {
                throw new Error('Error al silenciar usuario');
            }

        } catch (error) {
            Logger.error('Error en comando mute:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Error al silenciar usuario.' 
            }, { quoted: message });
        }
    }
};