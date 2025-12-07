// core/comandos.js 

const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');
const Config = require('../config/bot.json');
const ManejadorPropietarios = require('../utils/propietarios');

/**
 * Función auxiliar para determinar el tipo de contenido del mensaje para el contador.
 * @param {object} message - Objeto del mensaje de Baileys.
 * @returns {string|null} El tipo de archivo ('imagenes', 'videos', 'texto', etc.) o 'otros'.
 */
function determinarTipoMensaje(message) {
    const messageContent = message.message;
    if (!messageContent) return null;

    if (messageContent.imageMessage) {
        return 'imagenes';
    } else if (messageContent.videoMessage) {
        return 'videos';
    } else if (messageContent.stickerMessage) {
        return 'stickers';
    } else if (messageContent.audioMessage) {
        return 'audios';
    } else if (messageContent.documentMessage) {
        return 'documentos';
    } else if (messageContent.locationMessage) {
        return 'ubicaciones';
    } else if (messageContent.contactMessage || messageContent.contactsArrayMessage) {
        return 'contactos';
    } else if (messageContent.conversation || messageContent.extendedTextMessage) {
        // Se considera texto si hay contenido de conversación o texto extendido.
        return 'texto';
    }
    
    // Para cualquier otro tipo que no clasificamos específicamente.
    return 'otros';
}

class GestorComandos {
    constructor() {
        this.comandos = new Map();
        this.aliases = new Map();
        this.contadorComandos = 0;
        this.pluginsCargados = 0;
        this.prefix = Config.bot.prefix || '.';
        this.gestorGrupos = null;
        this.initGestorGrupos();
    }

    // Inicializar gestor de grupos
    initGestorGrupos() {
        try {
            const GestorGrupos = require('../database/gestorGrupos');
            this.gestorGrupos = new GestorGrupos();
            Logger.info('✅ Gestor de Grupos JSON inicializado');
        } catch (error) {
            Logger.warn('⚠️ No se pudo inicializar Gestor de Grupos:', error.message);
            this.gestorGrupos = null;
        }
    }

    // Cargar lista negra
    async cargarBlacklist() {
        try {
            const blacklistPath = path.join(__dirname, '../config/blacklist.json');
            if (!fs.existsSync(blacklistPath)) {
                // Crear archivo si no existe
                const blacklistData = { bannedUsers: [] };
                fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2));
                return blacklistData;
            }
            return JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
        } catch (error) {
            Logger.warn('⚠️ Error cargando blacklist:', error.message);
            return { bannedUsers: [] };
        }
    }

    // Verificar si usuario está baneado
    async estaUsuarioBaneado(remitenteCompleto) {
        try {
            const blacklistData = await this.cargarBlacklist();
            return blacklistData.bannedUsers.includes(remitenteCompleto);
        } catch (error) {
            Logger.debug('Error verificando blacklist:', error.message);
            return false;
        }
    }

    async cargarComandos() {
        try {
            const mensajeCargando = Config.mensajes?.comandos?.cargando || "🔄 Cargando comandos...";
            Logger.info(mensajeCargando);

            const pluginsPath = path.join(__dirname, '../plugins');

            // Verificar que la carpeta plugins existe
            if (!fs.existsSync(pluginsPath)) {
                Logger.warn('📂 Creando carpeta plugins...');
                fs.mkdirSync(pluginsPath, { recursive: true });

                // Crear estructura básica de carpetas
                const carpetas = ['owner', 'administracion', 'utilidades', 'diversion'];
                carpetas.forEach(carpeta => {
                    const carpetaPath = path.join(pluginsPath, carpeta);
                    if (!fs.existsSync(carpetaPath)) {
                        fs.mkdirSync(carpetaPath, { recursive: true });
                    }
                });

                Logger.info('📁 Estructura de plugins creada. Agrega tus comandos en la carpeta plugins/');
            }

            await this.cargarCarpetaPlugins(pluginsPath);

            const mensajeCargados = Config.mensajes?.comandos?.cargados || " comandos cargados correctamente";
            Logger.info(`✅ ${this.contadorComandos}${mensajeCargados}`);
            Logger.info(`📁 ${this.pluginsCargados} plugins cargados`);

            // Mostrar resumen de comandos cargados
            this.mostrarResumenComandos();

        } catch (error) {
            const mensajeError = Config.mensajes?.errores?.cargaPlugin || "⚠️ Error cargando plugin:";
            Logger.error(`${mensajeError} ${error.message}`);
            Logger.error('Stack trace:', error.stack);
        }
    }

    async cargarCarpetaPlugins(carpetaPath) {
        if (!fs.existsSync(carpetaPath)) {
            Logger.warn(`📂 Carpeta de plugins no encontrada: ${carpetaPath}`);
            return;
        }

        const items = fs.readdirSync(carpetaPath);

        for (const item of items) {
            const itemPath = path.join(carpetaPath, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory() && !item.startsWith('_')) {
                // Es una subcarpeta (owner, administracion, etc.)
                await this.cargarCarpetaPlugins(itemPath);
            } else if (stat.isFile() && item.endsWith('.js') && !item.startsWith('_')) {
                // Es un archivo JavaScript válido
                await this.cargarPlugin(itemPath);
            }
        }
    }

    async cargarPlugin(pluginPath) {
        try {
            // Limpiar cache para desarrollo
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);

            // Validar estructura del plugin
            if (!plugin.command || !Array.isArray(plugin.command) || plugin.command.length === 0) {
                Logger.warn(`⚠️ Plugin sin comandos válidos: ${path.basename(pluginPath)}`);
                return;
            }

            if (typeof plugin.execute !== 'function') {
                Logger.warn(`⚠️ Plugin sin función execute: ${path.basename(pluginPath)}`);
                return;
            }

            // Registrar comandos principales
            for (const comando of plugin.command) {
                const comandoKey = comando.toLowerCase();

                if (this.comandos.has(comandoKey)) {
                    Logger.warn(`⚠️ Comando duplicado: ${comando} en ${path.basename(pluginPath)}`);
                    continue;
                }

                this.comandos.set(comandoKey, {
                    execute: plugin.execute,
                    help: plugin.help || [],
                    description: plugin.description || 'Sin descripción',
                    category: this.obtenerCategoria(pluginPath),
                    isOwner: plugin.isOwner || false,
                    isGroup: plugin.isGroup || false,
                    isPrivate: plugin.isPrivate || true,
                    isAdmin: plugin.isAdmin || false,
                    filename: path.basename(pluginPath)
                });
                this.contadorComandos++;

                Logger.debug(`✅ Comando registrado: ${comando}`);
            }

            // Registrar aliases si existen
            if (plugin.aliases && Array.isArray(plugin.aliases)) {
                for (const alias of plugin.aliases) {
                    const aliasKey = alias.toLowerCase();
                    if (!this.aliases.has(aliasKey)) {
                        this.aliases.set(aliasKey, plugin.command[0]);
                        Logger.debug(`🔤 Alias registrado: ${alias} -> ${plugin.command[0]}`);
                    }
                }
            }

            this.pluginsCargados++;
            Logger.info(`📦 Plugin cargado: ${path.basename(pluginPath)} - ${plugin.command.join(', ')}`);

        } catch (error) {
            const mensajeError = Config.mensajes?.errores?.cargaPlugin || "⚠️ Error cargando plugin:";
            Logger.error(`${mensajeError} ${pluginPath}`);
            Logger.error(`Detalles: ${error.message}`);
        }
    }

    obtenerCategoria(pluginPath) {
        const pathParts = pluginPath.split(path.sep);
        const pluginsIndex = pathParts.indexOf('plugins');

        if (pluginsIndex !== -1 && pathParts[pluginsIndex + 1]) {
            return pathParts[pluginsIndex + 1].charAt(0).toUpperCase() + pathParts[pluginsIndex + 1].slice(1);
        }

        return 'General';
    }

    // ✅ MÉTODO PARA VERIFICAR MODO ADMIN (NUEVO)
    async verificarModoAdmin(socket, jid, remitenteCompleto) {
        try {
            if (!this.gestorGrupos) return { permitido: true, razon: 'sin_gestor_grupos' };
            
            // Obtener estado actual del modo admin
            const modoAdminActivo = await this.gestorGrupos.obtenerModoAdmin(jid);
            
            if (!modoAdminActivo) {
                return { 
                    permitido: true, 
                    razon: 'modo_admin_desactivado',
                    estado: 'INACTIVO'
                };
            }
            
            // Modo admin está activado, verificar si es administrador
            const metadata = await socket.groupMetadata(jid);
            const participant = metadata.participants.find(p => p.id === remitenteCompleto);
            const esAdmin = participant && ['admin', 'superadmin'].includes(participant.admin);
            
            if (esAdmin) {
                return { 
                    permitido: true, 
                    razon: 'es_administrador',
                    estado: 'ACTIVO_PERMITIDO'
                };
            } else {
                return { 
                    permitido: false, 
                    razon: 'modo_admin_activo_no_admin',
                    estado: 'ACTIVO_BLOQUEADO',
                    mensaje: '❌ *MODO SOLO ADMINISTRADORES ACTIVADO*\n\n' +
                             'Este bot solo responde a administradores.\n' +
                             '👑 *Solo administradores pueden usar comandos*\n\n' +
                             '🔧 *Para cambiar:*\n' +
                             '• Usa *.disable modoadmin* para desactivar este modo\n' +
                             '• O pide a un admin que te otorgue permisos'
                };
            }
        } catch (error) {
            Logger.error('Error verificando modo admin:', error);
            return { 
                permitido: true, 
                razon: 'error_default_permitir',
                estado: 'ERROR'
            };
        }
    }

    async ejecutarComando(socket, mensaje) {
        try {
            const texto = this.obtenerTexto(mensaje);
            const remitenteCompleto = this.obtenerRemitenteCompleto(mensaje);

            // ========== VERIFICACIÓN DE LISTA NEGRA ==========
            if (await this.estaUsuarioBaneado(remitenteCompleto)) {
                Logger.info(`🚫 Usuario baneado intentó usar comando: ${remitenteCompleto}`);
                return;
            }
            // =================================================

            // DEBUG: Log del mensaje recibido
            const remitente = this.obtenerRemitente(mensaje);
            Logger.debug(`📨 Mensaje de ${remitente}: ${texto}`);

            // ✅ NOTA: EL CONTADOR DE MENSAJES SE HACE AHORA EN main.js ANTES DE ESTA FUNCIÓN.

            // Solo procesar si es un comando (empieza con prefix)
            if (!texto.startsWith(this.prefix)) {
                return;
            }

            const args = texto.slice(this.prefix.length).trim().split(/ +/);
            const comandoNombre = args.shift().toLowerCase();

            if (!comandoNombre) {
                return;
            }

            Logger.info(`🔍 Ejecutando comando: ${this.prefix}${comandoNombre} - Args: [${args.join(', ')}]`);

            // ✅ VERIFICACIÓN ROBUSTA DEL SOCKET
            if (!socket) {
                Logger.error('❌ Socket no disponible para ejecutar comando');
                return;
            }

            // ✅ VERIFICACIÓN ADICIONAL DE ESTADO DEL SOCKET
            try {
                // Intentar un ping simple para verificar si el socket está activo
                socket.ev.emit('connection.update', { connection: 'open' });
            } catch (socketError) {
                Logger.error('❌ Socket inactivo, omitiendo comando:', socketError.message);
                return;
            }

            // Buscar comando directo o alias
            let comando = this.comandos.get(comandoNombre);

            if (!comando && this.aliases.has(comandoNombre)) {
                const comandoPrincipal = this.aliases.get(comandoNombre);
                comando = this.comandos.get(comandoPrincipal);
                Logger.debug(`🔤 Usando alias: ${comandoNombre} -> ${comandoPrincipal}`);
            }

            if (!comando) {
                Logger.debug(`❌ Comando no encontrado: ${comandoNombre}`);

                // Opcional: Enviar mensaje de comando no encontrado
                try {
                    const jid = mensaje.key.remoteJid;
                    const mensajeNoEncontrado = Config.mensajes?.comandos?.noEncontrado || "❌ Comando no encontrado";
                    await socket.sendMessage(jid, { 
                        text: `${mensajeNoEncontrado}\nUsa ${this.prefix}menu para ver los comandos disponibles.` 
                    }, { quoted: mensaje });
                } catch (sendError) {
                    Logger.debug('No se pudo enviar mensaje de comando no encontrado');
                }
                return;
            }

            // ========== VERIFICACIÓN MODO ADMINISTRADOR (NUEVO) ==========
            // ✅ VERIFICAR PRIMERO SI ESTAMOS EN GRUPO
            if (this.esGrupo(mensaje) && this.gestorGrupos) {
                const jid = mensaje.key.remoteJid;
                
                // Verificar modo admin en tiempo real
                const verificacionModoAdmin = await this.verificarModoAdmin(socket, jid, remitenteCompleto);
                Logger.debug(`🔐 Verificación modo admin: ${verificacionModoAdmin.razon} - Estado: ${verificacionModoAdmin.estado}`);
                
                // Si modo admin está activo y usuario NO es admin, BLOQUEAR
                if (!verificacionModoAdmin.permitido) {
                    Logger.warn(`🚫 Comando BLOQUEADO (Modo Admin): ${comandoNombre} por ${remitenteCompleto} en ${jid}`);
                    
                    // Enviar mensaje explicativo
                    if (verificacionModoAdmin.mensaje) {
                        try {
                            await socket.sendMessage(jid, {
                                text: verificacionModoAdmin.mensaje
                            }, { quoted: mensaje });
                        } catch (sendError) {
                            Logger.debug('No se pudo enviar mensaje de modo admin');
                        }
                    }
                    return; // ❌ BLOQUEAR comando
                }
            }
            // ============================================================

            // ========== SISTEMA DE PERMISOS MEJORADO ==========

            // 1. Verificar permisos de owner 
            if (comando.isOwner && !this.tienePermisosOwner(remitente, remitenteCompleto)) {
                const mensajeSinPermisos = Config.mensajes?.comandos?.sinPermisos || "⛔ No tienes permisos para usar este comando";
                Logger.warn(`🚫 Intento de uso sin permisos (Owner): ${comandoNombre} por ${remitente}`);

                try {
                    const jid = mensaje.key.remoteJid;
                    await socket.sendMessage(jid, { text: mensajeSinPermisos }, { quoted: mensaje });
                } catch (sendError) {
                    Logger.debug('No se pudo enviar mensaje de permisos');
                }
                return;
            }

            // 2. Verificar permisos de admin en grupos 
            if (comando.isAdmin && this.esGrupo(mensaje)) {
                if (!await this.tienePermisosAdmin(socket, mensaje)) {
                    const mensajeSinPermisos = "⛔ Solo los administradores pueden usar este comando";
                    Logger.warn(`🚫 Intento de uso sin permisos (Admin): ${comandoNombre} por ${remitente}`);

                    try {
                        const jid = mensaje.key.remoteJid;
                        await socket.sendMessage(jid, { text: mensajeSinPermisos }, { quoted: mensaje });
                    } catch (sendError) {
                        Logger.debug('No se pudo enviar mensaje de permisos admin');
                    }
                    return;
                }
            }

            // 3. Verificar si es grupo y el comando está permitido
            if (this.esGrupo(mensaje) && comando.isGroup === false) {
                try {
                    const jid = mensaje.key.remoteJid;
                    await socket.sendMessage(jid, { 
                        text: "❌ Este comando solo puede usarse en chats privados." 
                    }, { quoted: mensaje });
                } catch (sendError) {
                    Logger.debug('No se pudo enviar mensaje de restricción de grupo');
                }
                return;
            }

            // 4. Verificar si es privado y el comando está permitido
            if (!this.esGrupo(mensaje) && comando.isPrivate === false) {
                try {
                    const jid = mensaje.key.remoteJid;
                    await socket.sendMessage(jid, { 
                        text: "❌ Este comando solo puede usarse en grupos." 
                    }, { quoted: mensaje });
                } catch (sendError) {
                    Logger.debug('No se pudo enviar mensaje de restricción de privado');
                }
                return;
            }

            // ========== EJECUCIÓN DEL COMANDO ==========

            // Ejecutar comando
            Logger.info(`⚡ Ejecutando: ${comandoNombre} | Usuario: ${remitente} | Categoría: ${comando.category}`);

            // ✅ EJECUTAR CON MANEJO DE ERRORES ESPECÍFICO PARA CONEXIÓN
            try {
                await comando.execute(socket, mensaje, args);
                Logger.info(`✅ Comando ejecutado: ${comandoNombre}`);
            } catch (errorEjecucion) {
                // ✅ DETECTAR SI ES ERROR DE CONEXIÓN
                if (errorEjecucion.message.includes('Connection Closed') || 
                    errorEjecucion.message.includes('socket') || 
                    errorEjecucion.message.includes('not connected') ||
                    errorEjecucion.message.includes('ENOTFOUND')) {
                    
                    Logger.error('🔌 Error de conexión en comando:', errorEjecucion.message);
                    
                    try {
                        // ✅ INTENTAR OBTENER NUEVO SOCKET
                        const bot = require('../main');
                        const nuevoSocket = bot.obtenerSocket();
                        
                        if (nuevoSocket) {
                            const jid = mensaje.key.remoteJid;
                            await nuevoSocket.sendMessage(jid, { 
                                text: '🔌 *Conexión restablecida*\n\nEl bot se ha reconectado automáticamente.' 
                            }, { quoted: mensaje });
                        }
                    } catch (reconectarError) {
                        Logger.error('No se pudo notificar reconexión:', reconectarError.message);
                    }
                } else {
                    // Otro tipo de error
                    throw errorEjecucion;
                }
            }

        } catch (error) {
            const mensajeError = Config.mensajes?.errores?.ejecucion || "💥 Error ejecutando comando:";
            Logger.error(`${mensajeError} ${error.message}`);

            // ✅ DETECCIÓN MEJORADA DE ERRORES DE CONEXIÓN
            if (error.message.includes('Socket') || 
                error.message.includes('connection') || 
                error.message.includes('not connected') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ECONNREFUSED')) {
                
                Logger.error('🔌 Error de conexión detectado en comando ejecutar');
                
                // ✅ NO INTENTAR ENVIAR MENSAJE SI LA CONEXIÓN ESTÁ CAÍDA
                return;
            } else {
                Logger.error('Stack trace:', error.stack);
            }

            // Enviar mensaje de error al usuario (solo si no es error de conexión)
            try {
                const jid = mensaje.key.remoteJid;
                await socket.sendMessage(jid, { 
                    text: "❌ Ocurrió un error al ejecutar el comando. Intenta más tarde." 
                }, { quoted: mensaje });
            } catch (sendError) {
                Logger.debug('No se pudo enviar mensaje de error');
            }
        }
    }

    // ========== CONTADOR DE MENSAJES CORREGIDO ==========
    async contarMensaje(mensaje) {
        try {
            if (!this.gestorGrupos) return;

            const jid = mensaje.key.remoteJid;
            const remitenteCompleto = this.obtenerRemitenteCompleto(mensaje);
            const tipoMensaje = determinarTipoMensaje(mensaje);

            // Solo contar mensajes en grupos y que tengan un tipo de mensaje válido (no null)
            if (this.esGrupo(mensaje) && tipoMensaje) {
                // ✅ LLAMADA A LA FUNCIÓN DE REGISTRO CON EL TIPO DE ARCHIVO
                await this.gestorGrupos.registrarArchivo(jid, remitenteCompleto, tipoMensaje);
                Logger.debug(`📊 Mensaje (${tipoMensaje}) contado para ${remitenteCompleto} en ${jid}`);
            }
        } catch (error) {
            Logger.debug('Error contando mensaje:', error.message);
        }
    }

    // ========== SISTEMA DE VERIFICACIÓN DE PERMISOS ==========

    tienePermisosOwner(numero, remitenteCompleto) {
        return ManejadorPropietarios.esOwner(numero) || ManejadorPropietarios.esOwner(remitenteCompleto);
    }

    async tienePermisosAdmin(socket, mensaje) {
        try {
            const jid = mensaje.key.remoteJid;
            const remitenteCompleto = this.obtenerRemitenteCompleto(mensaje);

            // Obtener información del grupo
            const groupMetadata = await socket.groupMetadata(jid);
            const participant = groupMetadata.participants.find(p => p.id === remitenteCompleto);

            // Verificar si el remitente es admin
            return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
        } catch (error) {
            Logger.error('Error verificando permisos de admin:', error);
            return false;
        }
    }

    obtenerRemitenteCompleto(mensaje) {
        return mensaje.key.participant || mensaje.key.remoteJid;
    }

    obtenerRemitente(mensaje) {
        const remitente = this.obtenerRemitenteCompleto(mensaje);
        return remitente.split('@')[0]; // Solo el número
    }

    // ✅ OBTENER TEXTO (Lógica original, pero sujeta a la función de clasificación arriba)
    obtenerTexto(mensaje) {
        if (mensaje.message?.conversation) {
            return mensaje.message.conversation;
        }
        if (mensaje.message?.extendedTextMessage?.text) {
            return mensaje.message.extendedTextMessage.text;
        }
        if (mensaje.message?.imageMessage?.caption) {
            return mensaje.message.imageMessage.caption;
        }
        if (mensaje.message?.videoMessage?.caption) {
            return mensaje.message.videoMessage.caption;
        }
        return '';
    }

    esGrupo(mensaje) {
        return mensaje.key.remoteJid.endsWith('@g.us');
    }

    mostrarResumenComandos() {
        const categorias = {};

        for (const [nombre, comando] of this.comandos) {
            if (!categorias[comando.category]) {
                categorias[comando.category] = [];
            }
            categorias[comando.category].push({
                nombre: nombre,
                isOwner: comando.isOwner,
                isAdmin: comando.isAdmin
            });
        }

        console.log('\n📊 RESUMEN DE COMANDOS CARGADOS:');
        console.log('═'.repeat(60));

        for (const [categoria, comandos] of Object.entries(categorias)) {
            console.log(`\n📂 ${categoria.toUpperCase()}:`);

            comandos.forEach(cmd => {
                let permisos = '';
                if (cmd.isOwner) permisos = '👑 Owner';
                else if (cmd.isAdmin) permisos = '⚡ Admin';
                else permisos = '👤 Todos';

                console.log(`  ${this.prefix}${cmd.nombre.padEnd(15)} - ${permisos}`);
            });
        }

        console.log('═'.repeat(60));
        console.log(`🎯 Total: ${this.contadorComandos} comandos en ${Object.keys(categorias).length} categorías\n`);
    }

    obtenerListaComandos() {
        const lista = {};

        for (const [nombre, comando] of this.comandos) {
            if (!lista[comando.category]) {
                lista[comando.category] = [];
            }

            lista[comando.category].push({
                nombre: this.prefix + nombre,
                description: comando.description,
                help: comando.help,
                isOwner: comando.isOwner,
                isAdmin: comando.isAdmin,
                isGroup: comando.isGroup,
                isPrivate: comando.isPrivate,
                filename: comando.filename
            });
        }

        return lista;
    }

    // Método para obtener ayuda de un comando específico
    obtenerAyudaComando(nombreComando) {
        const comando = this.comandos.get(nombreComando.toLowerCase());
        if (!comando) return null;

        return {
            nombre: this.prefix + nombreComando,
            description: comando.description,
            help: comando.help,
            category: comando.category,
            isOwner: comando.isOwner,
            isAdmin: comando.isAdmin,
            isGroup: comando.isGroup,
            isPrivate: comando.isPrivate
        };
    }

    // Método para verificar si un comando existe
    existeComando(nombreComando) {
        return this.comandos.has(nombreComando.toLowerCase()) || 
               this.aliases.has(nombreComando.toLowerCase());
    }

    // Método para obtener comandos por tipo de permiso
    obtenerComandosPorPermiso(tipo) {
        const comandosFiltrados = [];

        for (const [nombre, comando] of this.comandos) {
            if (tipo === 'owner' && comando.isOwner) {
                comandosFiltrados.push(this.prefix + nombre);
            } else if (tipo === 'admin' && comando.isAdmin) {
                comandosFiltrados.push(this.prefix + nombre);
            } else if (tipo === 'all' && !comando.isOwner && !comando.isAdmin) {
                comandosFiltrados.push(this.prefix + nombre);
            }
        }

        return comandosFiltrados;
    }

    // Método para obtener el gestor de grupos (para otros comandos)
    obtenerGestorGrupos() {
        return this.gestorGrupos;
    }
}

module.exports = GestorComandos;