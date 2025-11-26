const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');
const fs = require('fs');
const path = require('path');

// Funciones auxiliares fuera del module.exports
async function generarMenuCompleto() {
    Logger.info('🔄 Iniciando generación de menú completo');
    const comandosPorCategoria = {};
    const pluginsPath = path.join(__dirname, '../..', 'plugins');

    Logger.info(`📂 Ruta de plugins: ${pluginsPath}`);

    // Verificar si la carpeta plugins existe
    if (!fs.existsSync(pluginsPath)) {
        Logger.error('🚨 La carpeta plugins NO existe');
        return crearMenuError('La carpeta plugins/ no existe');
    }

    Logger.info('✅ Carpeta plugins encontrada, explorando...');
    await explorarPlugins(pluginsPath, comandosPorCategoria);

    Logger.info(`📊 Categorías encontradas: ${Object.keys(comandosPorCategoria).length}`);
    for (const [categoria, comandos] of Object.entries(comandosPorCategoria)) {
        Logger.info(`   📂 ${categoria}: ${comandos.length} comandos`);
    }

    return formatearMenu(comandosPorCategoria);
}

async function explorarPlugins(carpetaPath, comandosPorCategoria) {
    Logger.info(`🔍 Explorando carpeta: ${carpetaPath}`);

    if (!fs.existsSync(carpetaPath)) {
        Logger.warn(`⚠️ Carpeta no existe: ${carpetaPath}`);
        return;
    }

    try {
        const items = fs.readdirSync(carpetaPath);
        Logger.info(`📁 Contenido de ${path.basename(carpetaPath)}: ${items.join(', ')}`);

        for (const item of items) {
            const itemPath = path.join(carpetaPath, item);
            Logger.info(`   📄 Procesando: ${item}`);

            try {
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory() && !item.startsWith('_')) {
                    Logger.info(`   📂 Es carpeta: ${item}`);
                    await explorarPlugins(itemPath, comandosPorCategoria);
                } else if (stat.isFile() && item.endsWith('.js') && !item.startsWith('_')) {
                    Logger.info(`   🔧 Es archivo plugin: ${item}`);
                    await procesarPlugin(itemPath, comandosPorCategoria);
                } else {
                    Logger.info(`   ❌ Ignorado: ${item} (no cumple criterios)`);
                }
            } catch (error) {
                Logger.error(`   💥 Error procesando ${item}:`, error.message);
            }
        }
    } catch (error) {
        Logger.error(`💥 Error leyendo carpeta ${carpetaPath}:`, error);
    }
}

async function procesarPlugin(pluginPath, comandosPorCategoria) {
    try {
        Logger.info(`   📦 Cargando plugin: ${path.basename(pluginPath)}`);

        delete require.cache[require.resolve(pluginPath)];
        const plugin = require(pluginPath);

        Logger.info(`   ✅ Plugin cargado: ${path.basename(pluginPath)}`);

        if (!plugin.command || !Array.isArray(plugin.command) || plugin.command.length === 0) {
            Logger.warn(`   ⚠️ Plugin sin comandos válidos: ${path.basename(pluginPath)}`);
            return;
        }

        const categoria = obtenerNombreCategoria(pluginPath);
        const comandoPrincipal = plugin.command[0];
        const descripcion = plugin.description || 'Sin descripción';
        const isOwner = plugin.isOwner || false;
        const isAdmin = plugin.isAdmin || false;

        Logger.info(`   🏷️ Categoría: ${categoria}`);
        Logger.info(`   🔧 Comando: ${comandoPrincipal}`);

        if (!comandosPorCategoria[categoria]) {
            comandosPorCategoria[categoria] = [];
            Logger.info(`   🆕 Nueva categoría creada: ${categoria}`);
        }

        comandosPorCategoria[categoria].push({
            nombre: Config.bot.prefix + comandoPrincipal,
            descripcion: descripcion,
            isOwner: isOwner,
            isAdmin: isAdmin
        });

        Logger.info(`   ✅ Comando agregado: ${comandoPrincipal} a ${categoria}`);

    } catch (error) {
        Logger.error(`   💥 Error cargando plugin ${path.basename(pluginPath)}:`, error.message);
    }
}

function obtenerNombreCategoria(pluginPath) {
    const partes = pluginPath.split(path.sep);
    const indicePlugins = partes.indexOf('plugins');

    if (indicePlugins !== -1 && partes[indicePlugins + 1]) {
        const carpeta = partes[indicePlugins + 1];
        return carpeta.charAt(0).toUpperCase() + carpeta.slice(1);
    }

    return 'General';
}

function formatearMenu(comandosPorCategoria) {
    Logger.info(`🎨 Formateando menú con ${Object.keys(comandosPorCategoria).length} categorías`);

    if (Object.keys(comandosPorCategoria).length === 0) {
        Logger.warn('⚠️ No hay comandos para mostrar en el menú');
        return crearMenuVacio();
    }

    let menu = `🛡️ *GUARDIAN BOT - MENÚ DE COMANDOS*\n`;
    menu += `Prefijo: ${Config.bot.prefix}\n\n`;

    // Ordenar categorías
    const categorias = Object.keys(comandosPorCategoria).sort();

    for (const categoria of categorias) {
        menu += `📂 *${categoria.toUpperCase()}*\n`;

        const comandos = comandosPorCategoria[categoria];
        comandos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        comandos.forEach(cmd => {
            let icono = '🔧';
            if (cmd.isOwner) icono = '👑';
            else if (cmd.isAdmin) icono = '⚡';

            menu += `${icono} *${cmd.nombre}* - ${cmd.descripcion}\n`;
        });

        menu += '\n';
    }

    menu += `🔐 *Leyenda:* 👑 Owner | ⚡ Admin | 🔧 Todos\n`;
    menu += `📖 Usa: ${Config.bot.prefix}help <comando>`;

    return menu;
}

function crearMenuVacio() {
    return `🛡️ *MENÚ DE COMANDOS*\n\n` +
           `No se encontraron comandos cargados.\n\n` +
           `💡 Verifica que los plugins estén en la carpeta plugins/`;
}

function crearMenuError(mensaje) {
    return `🛡️ *MENÚ DE COMANDOS*\n\n` +
           `❌ Error: ${mensaje}\n\n` +
           `🔧 Contacta al desarrollador`;
}

// Exportar el módulo
module.exports = {
    command: ['menu', 'help', 'comandos'],
    description: 'Mostrar menú de comandos disponibles',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        Logger.info(`🔍 Iniciando comando menu para ${jid}`);

        try {
            Logger.info('📁 Buscando comandos en plugins...');
            const menuMsg = await generarMenuCompleto();

            Logger.info(`📤 Enviando menú (${menuMsg.length} caracteres)`);
            await sock.sendMessage(jid, { text: menuMsg }, { quoted: message });
            Logger.info(`✅ Menú enviado exitosamente a ${jid}`);

        } catch (error) {
            Logger.error('💥 ERROR en comando menu:', error);

            try {
                await sock.sendMessage(jid, { 
                    text: `❌ Error al generar el menú:\n${error.message}` 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('🚨 Error enviando mensaje de error:', sendError);
            }
        }
    }
};