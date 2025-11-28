const Logger = require('../../utils/logger');
const Config = require('../../config/bot.json');
const fs = require('fs');
const path = require('path');

// Diseños personalizados
global.cmenuh = '╭━━〔 ';
global.cmenub = '┃ ';
global.cmenuf = '╰━━━━━━━━━━━━━━━━━━━━╯';
global.cmenua = '┃ ';

// Función para obtener estadísticas del bot
function obtenerEstadisticasBot() {
    try {
        return {
            mensajesProcesados: 0,
            comandosEjecutados: 0,
            inicio: new Date()
        };
    } catch (error) {
        return {
            mensajesProcesados: 0,
            comandosEjecutados: 0,
            inicio: new Date()
        };
    }
}

// Función para formatear tiempo
function formatearTiempo(ms) {
    const segundos = Math.floor(ms / 1000);
    const dias = Math.floor(segundos / (24 * 60 * 60));
    const horas = Math.floor((segundos % (24 * 60 * 60)) / (60 * 60));
    const minutos = Math.floor((segundos % (60 * 60)) / 60);
    const segs = segundos % 60;

    const partes = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}m`);
    if (segs > 0 || partes.length === 0) partes.push(`${segs}s`);

    return partes.join(' ');
}

// Función para convertir texto a negrita monoespaciada
function toBoldMono(text) {
    const mapping = {
        A: "𝗔", B: "𝗕", C: "𝗖", D: "𝗗", E: "𝗘", F: "𝗙", G: "𝗚", H: "𝗛", I: "𝗜", J: "𝗝", 
        K: "𝗞", L: "𝗟", M: "𝗠", N: "𝗡", O: "𝗢", P: "𝗣", Q: "𝗤", R: "𝗥", S: "𝗦", T: "𝗧",
        U: "𝗨", V: "𝗩", W: "𝗪", X: "𝗫", Y: "𝗬", Z: "𝗭",
        a: "𝗮", b: "𝗯", c: "𝗰", d: "𝗱", e: "𝗲", f: "𝗳", g: "𝗴", h: "𝗵", i: "𝗶", j: "𝗷",
        k: "𝗸", l: "𝗹", m: "𝗺", n: "𝗻", o: "𝗼", p: "𝗽", q: "𝗾", r: "𝗿", s: "𝘀", t: "𝘁",
        u: "𝘂", v: "𝘃", w: "𝘄", x: "𝘅", y: "𝘆", z: "𝘇",
        0: "𝟬", 1: "𝟭", 2: "𝟮", 3: "𝟯", 4: "𝟰", 5: "𝟱", 6: "𝟲", 7: "𝟳", 8: "𝟴", 9: "𝟵",
        " ": " ",
    };
    return text.split('').map(char => mapping[char] || char).join('');
}

// Función para generar el menú completo
async function generarMenuCompleto(sender) {
    const comandosPorCategoria = {};
    const pluginsPath = path.join(__dirname, '../..', 'plugins');

    if (!fs.existsSync(pluginsPath)) {
        return crearMenuError('La carpeta plugins/ no existe');
    }

    await explorarPlugins(pluginsPath, comandosPorCategoria);
    return formatearMenu(comandosPorCategoria, sender);
}

async function explorarPlugins(carpetaPath, comandosPorCategoria) {
    if (!fs.existsSync(carpetaPath)) return;

    try {
        const items = fs.readdirSync(carpetaPath);

        for (const item of items) {
            const itemPath = path.join(carpetaPath, item);

            try {
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory() && !item.startsWith('_')) {
                    await explorarPlugins(itemPath, comandosPorCategoria);
                } else if (stat.isFile() && item.endsWith('.js') && !item.startsWith('_')) {
                    await procesarPlugin(itemPath, comandosPorCategoria);
                }
            } catch (error) {
                Logger.debug(`Error procesando ${item}:`, error.message);
            }
        }
    } catch (error) {
        Logger.error(`Error leyendo carpeta ${carpetaPath}:`, error);
    }
}

async function procesarPlugin(pluginPath, comandosPorCategoria) {
    try {
        delete require.cache[require.resolve(pluginPath)];
        const plugin = require(pluginPath);

        if (!plugin.command || !Array.isArray(plugin.command) || plugin.command.length === 0) {
            return;
        }

        const categoria = obtenerNombreCategoria(pluginPath);
        const comandoPrincipal = plugin.command[0];
        const descripcion = plugin.description || 'Sin descripción';
        const isOwner = plugin.isOwner || false;
        const isAdmin = plugin.isAdmin || false;

        if (!comandosPorCategoria[categoria]) {
            comandosPorCategoria[categoria] = [];
        }

        comandosPorCategoria[categoria].push({
            nombre: Config.bot.prefix + comandoPrincipal,
            descripcion: descripcion,
            isOwner: isOwner,
            isAdmin: isAdmin
        });

    } catch (error) {
        Logger.debug(`Error cargando plugin ${path.basename(pluginPath)}:`, error.message);
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

function formatearMenu(comandosPorCategoria, sender) {
    if (Object.keys(comandosPorCategoria).length === 0) {
        return crearMenuVacio();
    }

    const stats = obtenerEstadisticasBot();
    const uptime = formatearTiempo(Date.now() - stats.inicio.getTime());
    const username = '@' + sender.split('@')[0];

    // Encabezado principal con diseño similar al primero
    const mainTitle = toBoldMono(` ${Config.bot.nombre} `);
    let menu = `╭━━〔 🔥 ${mainTitle} 🔥 〕━━╮\n`;
    menu += `${cmenub}👤 Hola, ${username}\n`;
    menu += `${cmenub}🕐 Activo: ${uptime}\n`;
    menu += `${cmenub}⚡ Prefijo: ${Config.bot.prefix}\n`;
    menu += `${cmenub}📊 Stats: ${stats.comandosEjecutados} cmd | ${stats.mensajesProcesados} msg\n`;
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;

    // Comandos por categoría - MOSTRAR TODOS LOS COMANDOS SIN LÍMITE
    const categorias = Object.keys(comandosPorCategoria).sort();

    for (const categoria of categorias) {
        const categoriaTitle = toBoldMono(` ${categoria.toUpperCase()} `);
        menu += `╭━━〔 📁 ${categoriaTitle} 〕━━╮\n`;

        const comandos = comandosPorCategoria[categoria];
        comandos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // MOSTRAR TODOS LOS COMANDOS SIN LÍMITE
        for (const cmd of comandos) {
            let icono = '•';
            if (cmd.isOwner) icono = '👑';
            else if (cmd.isAdmin) icono = '⚡';

            menu += `${cmenub}${icono} ${cmd.nombre}\n`;
        }

        menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;
    }

    // Pie de página
    menu += `╭━━━━━━━━━━━━━━━━━━━━╮\n`;
    menu += `${cmenub}💡 Usa: ${Config.bot.prefix}help <comando>\n`;
    menu += `${cmenub}📚 Para ver detalles específicos\n`;
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯`;

    return menu;
}

function crearMenuVacio() {
    return `╭━━〔 ⚠️  MENÚ DE COMANDOS  ⚠️ 〕━━╮\n` +
           `${cmenub}❌ No se encontraron comandos\n` +
           `${cmenub}💡 Verifica la carpeta plugins/\n` +
           `╰━━━━━━━━━━━━━━━━━━━━╯`;
}

function crearMenuError(mensaje) {
    return `╭━━〔 ❌ ERROR 』━━╮\n` +
           `${cmenub}${mensaje}\n` +
           `${cmenub}🔧 Contacta al desarrollador\n` +
           `╰━━━━━━━━━━━━━━━━━━━━╯`;
}

// Exportar el módulo
module.exports = {
    command: ['menu', 'help', 'comandos', 'ayuda'],
    description: 'Mostrar menú completo de comandos disponibles',
    isOwner: false,
    isGroup: true,
    isPrivate: true,

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;

        try {
            // Reacción inmediata
            await sock.sendMessage(jid, {
                react: { text: "📱", key: message.key }
            });

            Logger.info(`📋 Generando menú para ${jid}`);
            const menuTexto = await generarMenuCompleto(sender);

            // ✅ INTENTAR ENVIAR CON IMAGEN DE URL
            try {
                await sock.sendMessage(jid, {
                    image: { url: "https://files.catbox.moe/82y8uz.png" },
                    caption: menuTexto,
                    mentions: [sender]
                }, { quoted: message });

                Logger.info('✅ Menú con imagen enviado exitosamente');
                return;

            } catch (imageError) {
                Logger.debug('❌ No se pudo enviar con imagen:', imageError.message);
            }

            // ✅ SI FALLA LA IMAGEN, ENVIAR SOLO TEXTO
            await sock.sendMessage(jid, { 
                text: menuTexto,
                mentions: [sender]
            }, { quoted: message });
            Logger.info('✅ Menú de texto enviado exitosamente');

        } catch (error) {
            Logger.error('💥 ERROR en comando menu:', error);

            try {
                await sock.sendMessage(jid, {
                    react: { text: "❌", key: message.key }
                });

                await sock.sendMessage(jid, { 
                    text: `❌ Error al generar el menú:\n${error.message}` 
                }, { quoted: message });
            } catch (sendError) {
                Logger.error('🚨 Error enviando mensaje de error:', sendError);
            }
        }
    }
};