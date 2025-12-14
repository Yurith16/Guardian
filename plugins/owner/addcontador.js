const Logger = require('../../utils/logger');
const ManejadorPropietarios = require('../../utils/propietarios');

module.exports = {
    command: ['addcont', 'agregararchivos', 'addarchivos'],
    description: 'Agregar cantidad a archivos "otros" de un usuario (Solo Owner)',
    isOwner: true,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const remitente = message.key.participant || message.key.remoteJid;

        try {
            // ✅ VERIFICACIÓN DE PERMISOS - SOLO OWNER
            if (!ManejadorPropietarios.esOwner(remitente)) {
                Logger.warn(`🚫 Intento de uso no autorizado de .addcont por: ${remitente}`);
                return await sock.sendMessage(jid, { 
                    text: '⛔ *Acceso Denegado*\nSolo los propietarios del bot pueden usar este comando.' 
                }, { quoted: message });
            }

            // Verificar si se ejecuta en un grupo
            if (!jid.endsWith('@g.us')) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Este comando solo puede usarse en grupos.' 
                }, { quoted: message });
            }

            // Verificar argumentos
            if (args.length < 2) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Uso Correcto:*\n.addcont @usuario cantidad\n.addcont 258488697675885@lid 10\n\n📝 *Ejemplo:*\n.addcont 97144291758246@lid 50 - Agrega 50 archivos "otros" al usuario' 
                }, { quoted: message });
            }

            let usuarioJid;
            let cantidad;

            // Detectar si se mencionó un usuario
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                usuarioJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                cantidad = parseInt(args[args.length - 1]);
            } else {
                // Si no hay mención, usar el primer argumento como JID
                usuarioJid = args[0];

                // Verificar formato del JID
                if (!usuarioJid.includes('@')) {
                    // Asumir que es un número y añadir sufijo común
                    if (usuarioJid.match(/^\d+$/)) {
                        usuarioJid = `${usuarioJid}@lid`;
                    } else {
                        return await sock.sendMessage(jid, { 
                            text: '❌ *Formato inválido.*\nUsa: .addcont @usuario cantidad\nO: .addcont 97144291758246@lid 10' 
                        }, { quoted: message });
                    }
                }

                cantidad = parseInt(args[1]);
            }

            // Validar cantidad
            if (isNaN(cantidad) || cantidad <= 0 || cantidad > 10000) {
                return await sock.sendMessage(jid, { 
                    text: '❌ *Cantidad inválida.*\nLa cantidad debe ser un número entre 1 y 10000.' 
                }, { quoted: message });
            }

            // Obtener gestor de grupos
            const gestorGrupos = sock.guardianBot?.gestorComandos?.obtenerGestorGrupos();
            if (!gestorGrupos) {
                return await sock.sendMessage(jid, { 
                    text: '❌ El sistema de archivos no está disponible.' 
                }, { quoted: message });
            }

            // Obtener datos del grupo
            let datosGrupo = await gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo) {
                // Inicializar grupo si no existe
                datosGrupo = await gestorGrupos.inicializarGrupo(jid);
                if (!datosGrupo) {
                    return await sock.sendMessage(jid, { 
                        text: '❌ Error al inicializar el grupo.' 
                    }, { quoted: message });
                }
            }

            // Verificar o crear usuario
            let usuarioExiste = false;
            if (!datosGrupo.usuarios[usuarioJid]) {
                // Crear nuevo usuario si no existe
                const numero = usuarioJid.split('@')[0];
                const fechaActual = new Date().toISOString();
                const fechaHoy = new Date().toDateString();

                datosGrupo.usuarios[usuarioJid] = {
                    numero: numero,
                    archivos: {
                        imagenes: 0,
                        videos: 0,
                        audios: 0,
                        documentos: 0,
                        stickers: 0,
                        otros: 0
                    },
                    total_archivos: 0,
                    ultimo_archivo: fechaActual,
                    primer_archivo: fechaActual,
                    es_admin: datosGrupo.administradores ? datosGrupo.administradores.includes(usuarioJid) : false,
                    stickers_diarios: {
                        fecha: fechaHoy,
                        contador: 0
                    },
                    mensajes_totales: 0,
                    mensajes_semana: 0
                };

                Logger.info(`✅ Nuevo usuario creado: ${usuarioJid} en grupo ${jid}`);
            } else {
                usuarioExiste = true;
            }

            // Obtener referencia al usuario
            const usuario = datosGrupo.usuarios[usuarioJid];

            // Guardar valores anteriores para mostrar en el mensaje
            const otrosAnterior = usuario.archivos.otros;
            const totalAnterior = usuario.total_archivos;

            // Incrementar contadores
            usuario.archivos.otros += cantidad;
            usuario.total_archivos += cantidad;
            usuario.ultimo_archivo = new Date().toISOString();

            // Actualizar estadísticas del grupo
            datosGrupo.estadisticas.total_mensajes += cantidad;
            datosGrupo.estadisticas.ultima_actividad = new Date().toISOString();
            datosGrupo.fecha_actualizacion = new Date().toISOString();

            // Guardar cambios
            const guardadoExitoso = await gestorGrupos.guardarDatos(jid, datosGrupo);

            if (!guardadoExitoso) {
                return await sock.sendMessage(jid, { 
                    text: '❌ Error al guardar los cambios en la base de datos.' 
                }, { quoted: message });
            }

            const usuarioNumero = usuarioJid.split('@')[0];
            const grupoNombre = datosGrupo.nombre || 'el grupo';

            // Construir mensaje de éxito
            let mensajeExito = '✅ *ARCHIVOS AGREGADOS CON ÉXITO*\n\n';
            mensajeExito += `👤 *Usuario:* ${usuarioNumero}\n`;
            mensajeExito += `📁 *Tipo:* Otros archivos\n`;
            mensajeExito += `➕ *Cantidad agregada:* ${cantidad}\n`;
            mensajeExito += `📊 *Otros antes:* ${otrosAnterior}\n`;
            mensajeExito += `📊 *Otros ahora:* ${usuario.archivos.otros}\n`;
            mensajeExito += `📈 *Total archivos:* ${usuario.total_archivos}\n`;
            mensajeExito += `🏠 *Grupo:* ${grupoNombre}\n`;
            mensajeExito += `⏰ *Fecha:* ${new Date().toLocaleString()}\n`;

            if (!usuarioExiste) {
                mensajeExito += `\n📝 *Nota:* Se creó un nuevo registro para este usuario.`;
            }

            await sock.sendMessage(jid, { 
                text: mensajeExito
            }, { quoted: message });

            Logger.info(`✅ Archivos agregados: ${cantidad} a usuario ${usuarioJid} en grupo ${jid} por ${remitente}`);

        } catch (error) {
            Logger.error('Error en comando addcont:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: '❌ *Error al agregar archivos.*\nVerifica que el usuario y la cantidad sean válidos.' 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('Error enviando mensaje:', sendError);
            }
        }
    }
};