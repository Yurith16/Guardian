const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');
const Config = require('../config/bot.json');
const ManejadorPropietarios = require('../utils/propietarios');

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

    async ejecutarComando(socket, mensaje) {
        try {
            const texto = this.obtenerTexto(mensaje);
            const remitenteCompleto = this.obtenerRemitenteCompleto(mensaje);

            // ========== VERIFICACIÓN DE LISTA NEGRA ==========
            if (await this.estaUsuarioBaneado(remitenteCompleto)) {
                Logger.info(`🚫 Usuario baneado intentó usar comando: ${remitenteCompleto}`);
                return; // No procesar el mensaje
            }
            // =================================================

            // DEBUG: Log del mensaje recibido
            const remitente = this.obtenerRemitente(mensaje);
            Logger.debug(`📨 Mensaje de ${remitente}: ${texto}`);

            // ========== CONTADOR DE MENSAJES ==========
            await this.contarMensaje(mensaje);
            // ==========================================

            // Solo procesar si es un comando (empieza con prefix)
            if (!texto.startsWith(this.prefix)) {
                return;
            }

            const args = texto.slice(this.prefix.length).trim().split(/ +/);
            const comandoNombre = args.shift().toLowerCase();

            if (!comandoNombre) {
                return; // Solo el prefix, ignorar
            }

            Logger.info(`🔍 Ejecutando comando: ${this.prefix}${comandoNombre} - Args: [${args.join(', ')}]`);

            // ✅ VERIFICAR SI EL SOCKET ESTÁ ACTIVO
            if (!socket || !socket.user) {
                Logger.error('❌ Socket no disponible, no se puede ejecutar comando');

                try {
                    const jid = mensaje.key.remoteJid;
                    await socket.sendMessage(jid, { 
                        text: '🔌 *Bot reconectándose...*\n\nIntenta nuevamente en unos segundos.' 
                    }, { quoted: mensaje });
                } catch (sendError) {
                    Logger.error('No se pudo enviar mensaje de error:', sendError);
                }
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
                const jid = mensaje.key.remoteJid;
                const mensajeNoEncontrado = Config.mensajes?.comandos?.noEncontrado || "❌ Comando no encontrado";
                await socket.sendMessage(jid, { 
                    text: `${mensajeNoEncontrado}\nUsa ${this.prefix}menu para ver los comandos disponibles.` 
                }, { quoted: mensaje });
                return;
            }

            // ========== SISTEMA DE PERMISOS MEJORADO ==========

            // 1. Verificar permisos de owner
            if (comando.isOwner && !this.tienePermisosOwner(remitente, remitenteCompleto)) {
                const mensajeSinPermisos = Config.mensajes?.comandos?.sinPermisos || "⛔ No tienes permisos para usar este comando";
                Logger.warn(`🚫 Intento de uso sin permisos (Owner): ${comandoNombre} por ${remitente}`);

                const jid = mensaje.key.remoteJid;
                await socket.sendMessage(jid, { text: mensajeSinPermisos }, { quoted: mensaje });
                return;
            }

            // 2. Verificar permisos de admin en grupos
            if (comando.isAdmin && this.esGrupo(mensaje)) {
                if (!await this.tienePermisosAdmin(socket, mensaje)) {
                    const mensajeSinPermisos = "⛔ Solo los administradores pueden usar este comando";
                    Logger.warn(`🚫 Intento de uso sin permisos (Admin): ${comandoNombre} por ${remitente}`);

                    const jid = mensaje.key.remoteJid;
                    await socket.sendMessage(jid, { text: mensajeSinPermisos }, { quoted: mensaje });
                    return;
                }
            }

            // 3. Verificar si es grupo y el comando está permitido
            if (this.esGrupo(mensaje) && comando.isGroup === false) {
                const jid = mensaje.key.remoteJid;
                await socket.sendMessage(jid, { 
                    text: "❌ Este comando solo puede usarse en chats privados." 
                }, { quoted: mensaje });
                return;
            }

            // 4. Verificar si es privado y el comando está permitido
            if (!this.esGrupo(mensaje) && comando.isPrivate === false) {
                const jid = mensaje.key.remoteJid;
                await socket.sendMessage(jid, { 
                    text: "❌ Este comando solo puede usarse en grupos." 
                }, { quoted: mensaje });
                return;
            }

            // ========== EJECUCIÓN DEL COMANDO ==========

            // Ejecutar comando
            Logger.info(`⚡ Ejecutando: ${comandoNombre} | Usuario: ${remitente} | Categoría: ${comando.category}`);

            await comando.execute(socket, mensaje, args);

            Logger.info(`✅ Comando ejecutado: ${comandoNombre}`);

        } catch (error) {
            const mensajeError = Config.mensajes?.errores?.ejecucion || "💥 Error ejecutando comando:";
            Logger.error(`${mensajeError} ${error.message}`);

            // ✅ MEJORADO: Distinguir entre errores de conexión y otros errores
            if (error.message.includes('Socket') || error.message.includes('connection') || error.message.includes('not connected')) {
                Logger.error('🔌 Error de conexión detectado');
            } else {
                Logger.error('Stack trace:', error.stack);
            }

            // Enviar mensaje de error al usuario
            try {
                const jid = mensaje.key.remoteJid;
                await socket.sendMessage(jid, { 
                    text: "❌ Ocurrió un error al ejecutar el comando. Intenta más tarde." 
                }, { quoted: mensaje });
            } catch (sendError) {
                Logger.error('Error enviando mensaje de error:', sendError);
            }
        }
    }

    // ========== CONTADOR DE MENSAJES ==========
    async contarMensaje(mensaje) {
        try {
            if (!this.gestorGrupos) return;

            const jid = mensaje.key.remoteJid;
            const remitenteCompleto = this.obtenerRemitenteCompleto(mensaje);

            // Solo contar mensajes en grupos
            if (this.esGrupo(mensaje)) {
                await this.gestorGrupos.registrarMensaje(jid, remitenteCompleto);
                Logger.debug(`📊 Mensaje contado para ${remitenteCompleto} en ${jid}`);
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