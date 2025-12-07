const Logger = require('../../utils/logger');
const GestorGrupos = require('../../database/gestorGrupos');

module.exports = {
    command: ['tagall', 'todos', 'invocar', 'contador'],
    description: 'Mencionar a todos los miembros con estadísticas en tiempo real',
    isGroup: true,
    isPrivate: false,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;

        try {
            Logger.info(`🔍 Iniciando tagall para: ${jid}`);

            // 1. Obtener información actualizada del grupo
            const groupInfo = await sock.groupMetadata(jid);
            const participantes = groupInfo.participants;
            
            Logger.info(`✅ Grupo: ${groupInfo.subject}, Miembros: ${participantes.length}`);

            // 2. Inicializar gestor de grupos
            const gestorGrupos = new GestorGrupos();

            // 3. ACTUALIZAR DATOS EN TIEMPO REAL
            Logger.info('🔄 Actualizando datos del grupo en tiempo real...');
            try {
                await gestorGrupos.actualizarDatosGrupoTiempoReal(jid, groupInfo);
                Logger.info('✅ Datos actualizados');
            } catch (updateError) {
                Logger.warn('⚠️ Error actualizando datos:', updateError.message);
                // Continuar aunque falle
            }

            // 4. Obtener usuarios con sus mensajes
            Logger.info('📊 Obteniendo estadísticas de usuarios...');
            let usuariosConMensajes = [];
            try {
                usuariosConMensajes = await gestorGrupos.obtenerUsuariosConMensajes(jid);
                Logger.info(`✅ ${usuariosConMensajes.length} usuarios con datos`);
            } catch (statsError) {
                Logger.warn('⚠️ Error obteniendo estadísticas:', statsError.message);
            }

            // 5. Combinar todos los participantes
            const todosUsuariosMap = new Map();

            // Agregar usuarios con mensajes
            usuariosConMensajes.forEach(usuario => {
                todosUsuariosMap.set(usuario.usuario_id, usuario);
            });

            // Agregar participantes que no están en la base de datos
            participantes.forEach(participante => {
                if (!todosUsuariosMap.has(participante.id)) {
                    // Buscar si el participante es admin
                    const esAdmin = !!participante.admin;
                    
                    todosUsuariosMap.set(participante.id, {
                        usuario_id: participante.id,
                        numero: participante.id.split('@')[0],
                        mensajes_totales: 0,
                        mensajes_texto: 0,
                        total_archivos: 0,
                        es_admin: esAdmin
                    });
                } else {
                    // Actualizar estado de admin
                    todosUsuariosMap.get(participante.id).es_admin = !!participante.admin;
                }
            });

            // Convertir a array y ordenar
            const todosUsuarios = Array.from(todosUsuariosMap.values())
                .sort((a, b) => {
                    // Primero admins, luego por mensajes
                    if (a.es_admin && !b.es_admin) return -1;
                    if (!a.es_admin && b.es_admin) return 1;
                    return b.mensajes_totales - a.mensajes_totales;
                });

            // 6. Calcular totales
            const totalMensajes = todosUsuarios.reduce((sum, user) => sum + user.mensajes_totales, 0);
            const adminsCount = todosUsuarios.filter(u => u.es_admin).length;

            // 7. Construir mensaje
            let mensaje = `🔔 *MENCIÓN GENERAL* 🔔\n\n`;
            mensaje += `🏷️ *Grupo:* ${groupInfo.subject}\n`;
            mensaje += `👥 *Miembros:* ${participantes.length}\n`;
            mensaje += `👑 *Admins:* ${adminsCount}\n`;
            mensaje += `📊 *Mensajes totales:* ${totalMensajes}\n`;
            mensaje += `🕒 *Actualizado:* ${new Date().toLocaleTimeString()}\n\n`;
            mensaje += `📝 *LISTA DE MIEMBROS:*\n\n`;

            const mentions = [];
            let contador = 1;

            // Mostrar todos los usuarios
            for (const usuario of todosUsuarios) {
                const iconoAdmin = usuario.es_admin ? '👑 ' : '';
                const mensajesText = usuario.mensajes_totales > 0 ? 
                    `📨${usuario.mensajes_totales}` : 
                    `📨0`;

                mensaje += `${contador}. ${iconoAdmin}@${usuario.numero} ${mensajesText}\n`;
                mentions.push(usuario.usuario_id);
                contador++;
            }

            mensaje += `\n✅ *Resumen:* ${mentions.length} miembros mencionados`;

            // 8. Limitar menciones (WhatsApp tiene límite)
            const mencionesEnviar = mentions.slice(0, 250);

            // 9. Enviar mensaje
            await sock.sendMessage(jid, { 
                text: mensaje,
                mentions: mencionesEnviar
            }, { quoted: message });

            Logger.info(`✅ Tagall enviado: ${mencionesEnviar.length} menciones, ${totalMensajes} mensajes totales`);

        } catch (error) {
            Logger.error('❌ Error en tagall:', error);
            
            try {
                await sock.sendMessage(jid, { 
                    text: '❌ Error al mencionar miembros.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje de error:', sendError);
            }
        }
    }
};