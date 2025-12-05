const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

// Crear una instancia global del gestor de grupos
let gestorGruposGlobal = null;

// Inicializar el gestor de grupos una sola vez
function obtenerGestorGrupos() {
    if (!gestorGruposGlobal) {
        try {
            gestorGruposGlobal = new GestorGrupos();
            Logger.info('✅ GestorGrupos global inicializado en tagall');
        } catch (error) {
            Logger.error('❌ Error inicializando GestorGrupos global:', error);
            return null;
        }
    }
    return gestorGruposGlobal;
}

module.exports = {
    command: ['tagall', 'todos', 'invocar','contador'],
    description: 'Mencionar a todos los miembros con estadísticas',
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        Logger.info(`🔍 Iniciando comando tagall para grupo: ${jid}`);

        try {
            Logger.info('📋 Paso 1: Obteniendo información del grupo...');
            const groupInfo = await sock.groupMetadata(jid);
            Logger.info(`✅ Info grupo obtenida: ${groupInfo.subject} con ${groupInfo.participants?.length} miembros`);

            Logger.info('📋 Paso 2: Obteniendo GestorGrupos...');
            const gestorGrupos = obtenerGestorGrupos();

            if (!gestorGrupos) {
                throw new Error('No se pudo inicializar el gestor de grupos');
            }
            Logger.info('✅ GestorGrupos obtenido correctamente');

            Logger.info('📋 Paso 3: Actualizando información del grupo...');
            try {
                await gestorGrupos.actualizarInfoGrupo(jid, groupInfo);
                Logger.info('✅ Info grupo actualizada');
            } catch (updateError) {
                Logger.error('❌ Error actualizando info grupo:', updateError);
                // Continuar aunque falle la actualización
            }

            Logger.info('📋 Paso 4: Obteniendo ranking de usuarios...');
            let ranking = [];
            try {
                // Obtener TODOS los usuarios con mensajes
                ranking = await gestorGrupos.obtenerRankingUsuarios(jid, 1000);
                Logger.info(`✅ Ranking obtenido: ${ranking.length} usuarios con mensajes`);
            } catch (rankingError) {
                Logger.error('❌ Error obteniendo ranking:', rankingError);
                // Continuar con ranking vacío
            }

            const participantes = groupInfo.participants;
            Logger.info(`📊 Total participantes: ${participantes.length}`);

            Logger.info('📋 Paso 5: Combinando TODOS los usuarios...');

            // Crear un mapa de TODOS los usuarios con sus mensajes
            const usuariosMap = new Map();

            // Agregar usuarios del ranking (con mensajes)
            ranking.forEach(usuario => {
                usuariosMap.set(usuario.usuario_id, {
                    ...usuario,
                    tieneMensajes: true
                });
            });

            // Agregar usuarios que no están en el ranking (sin mensajes)
            participantes.forEach(participante => {
                if (!usuariosMap.has(participante.id)) {
                    usuariosMap.set(participante.id, {
                        usuario_id: participante.id,
                        numero: participante.id.split('@')[0],
                        mensajes_totales: 0,
                        es_admin: participante.admin,
                        tieneMensajes: false
                    });
                } else {
                    // Actualizar información de admin para usuarios existentes
                    usuariosMap.get(participante.id).es_admin = participante.admin;
                }
            });

            // Convertir a array y ordenar por mensajes (descendente)
            const todosUsuarios = Array.from(usuariosMap.values()).sort((a, b) => {
                return b.mensajes_totales - a.mensajes_totales;
            });

            Logger.info(`📋 Paso 6: Construyendo mensaje con TODOS los usuarios (${todosUsuarios.length})...`);
            let mensaje = `🔔 *MENCIÓN GENERAL* 🔔\n\n`;
            mensaje += `🏷️ *Grupo:* ${groupInfo.subject}\n`;
            mensaje += `👥 *Total miembros:* ${participantes.length}\n`;
            mensaje += `📊 *Mensajes totales:* ${ranking.reduce((sum, user) => sum + (user.mensajes_totales || 0), 0)}\n\n`;
            mensaje += `📝 *LISTA COMPLETA DE MIEMBROS:*\n\n`;

            const mentions = [];
            let contador = 1;

            // Mostrar TODOS los usuarios en formato compacto - SIN LÍMITES
            for (const usuario of todosUsuarios) {
                try {
                    const iconoAdmin = usuario.es_admin ? ' 👑' : '';
                    const mensajesText = usuario.mensajes_totales > 0 ? 
                        `📨 ${usuario.mensajes_totales}` : 
                        `📨 0`;

                    // Formato: 1. @usuario 👑 📨 25
                    mensaje += `${contador}. @${usuario.numero}${iconoAdmin} ${mensajesText}\n`;

                    mentions.push(usuario.usuario_id);
                    contador++;

                    // ✅ ELIMINADO EL LÍMITE - MOSTRAR TODOS LOS USUARIOS

                } catch (userError) {
                    Logger.error(`❌ Error procesando usuario:`, userError);
                }
            }

            mensaje += `\n✅ *Total mencionados: ${todosUsuarios.length} miembros*`;

            Logger.info(`📤 Enviando mensaje con TODAS las menciones: ${mentions.length} usuarios...`);

            Logger.info('📋 Paso 7: Enviando mensaje...');
            await sock.sendMessage(jid, { 
                text: mensaje,
                mentions: mentions
            }, { quoted: message });

            Logger.info(`✅ Tagall enviado exitosamente con ${mentions.length} menciones en ${groupInfo.subject}`);

        } catch (error) {
            Logger.error('💥 ERROR CRÍTICO en comando tagall:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: `❌ Error al mencionar miembros:\n${error.message}` 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('🚨 Error enviando mensaje de error:', sendError);
            }
        }
    }
};