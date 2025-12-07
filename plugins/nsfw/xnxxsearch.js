const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { getPrefix } = require("../../handlers/commandHandler.js");
// ⚠️ Asegúrate de que esta ruta sea correcta a tu GestorGrupos
const GestorGrupos = require("../../database/GestorGrupos"); 

// Inicializa el gestor de grupos
const gestorGrupos = new GestorGrupos();

// --- CONFIGURACIÓN DE RUTAS OBSOLETAS ELIMINADAS ---

// =================================================================
// 🔥 MENSAJES ATREVIDOS Y CONSOLIDADOS PARA BÚSQUEDA 🔥
// =================================================================
const NSFW_ATREVIDO_SEARCH = {
    // --- Flujo Principal Consolidado ---
    buscando:
        "🤫 ¡Espera! Estoy revisando los rincones más sucios de XNXX por ti. Dame un momento... 🔍",
    exito: "😈 ¡Aquí están los resultados! Mira la lista y elige tu placer. 👇", 
    // --- Errores y Excepciones ---
    sin_argumentos:
        "🥵 Veo que tienes prisa. Para empezar la acción, dame el *término* de búsqueda. ¡No seas tímido! 😌",
    error_no_encontrado:
        "🤔 No encontré nada para esa *fantasía*... Intenta ser más específico o buscar algo más popular. 🤨",
    // 🚩 MENSAJE ACTUALIZADO PARA BLOQUEO GRUPAL
    error_nsfw_off:
        "⛔ ¡ALTO! Los comandos NSFW están *desactivados* en este grupo. Un administrador o el Owner debe usar `!nsfw enable` para encender el burdel digital. 😞",
    error_general:
        "💔 Algo se ha roto en el proceso de búsqueda. Vuelve a intentarlo con más *discreción*. 🥺",
};

// --- ELIMINADA: La función readNsfwStatus() y CONFIG_PATH ya no son necesarios ---

// --- Función de Búsqueda (xnxxsearch) sin cambios ---
/**
 * Busca videos en XNXX.
 * @param {string} query - El término de búsqueda.
 */
async function xnxxsearch(query) {
    return new Promise((resolve, reject) => {
        const baseurl = "https://www.xnxx.com";
        fetch(`${baseurl}/search/${query}/${Math.floor(Math.random() * 3) + 1}`, {
            method: "get",
        })
            .then((res) => res.text())
            .then((res) => {
                const $ = cheerio.load(res, { xmlMode: false });
                const title = [];
                const url = [];
                const desc = [];
                const results = [];

                $("div.mozaique").each(function (a, b) {
                    $(b)
                        .find("div.thumb")
                        .each(function (c, d) {
                            url.push(
                                baseurl + $(d).find("a").attr("href").replace("/THUMBNUM/", "/")
                            );
                        });
                });

                $("div.mozaique").each(function (a, b) {
                    $(b)
                        .find("div.thumb-under")
                        .each(function (c, d) {
                            desc.push($(d).find("p.metadata").text().trim());
                            $(d)
                                .find("a")
                                .each(function (e, f) {
                                    title.push($(f).attr("title"));
                                });
                        });
                });

                for (let i = 0; i < title.length; i++) {
                    if (title[i] && url[i]) {
                        // Aquí separamos la información de 'info' (que contiene duración, vistas y tiempo)
                        const infoString = desc[i] || "N/A"; 
                        const parts = infoString.split("|").map((p) => p.trim());
                        let durationQuality = parts[0] || "N/A"; 
                        let viewsAndDate = parts[1] || "N/A"; 

                        results.push({
                            title: title[i],
                            info: infoString,
                            durationQuality: durationQuality,
                            viewsAndDate: viewsAndDate,
                            link: url[i],
                        });
                    }
                }

                if (results.length === 0) {
                    return reject(new Error("No se encontraron resultados."));
                }

                resolve({ code: 200, status: true, result: results });
            })
            .catch((err) =>
                reject({ code: 503, status: false, result: err.message })
            );
    });
}

// --- Handler Principal del Comando Refactorizado ---

const execute = async (sock, message, args) => {
    const jid = message.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const text = args.join(" ");
    const currentPrefix = getPrefix();
    const commandAlias = command.command[0];
    const downloadCommandAlias = "xnxxdl";
    const ejemploBusqueda = "con mi prima"; 
    
    // -------------------------------------------------------------------
    // ✅ NUEVA LÓGICA DE VERIFICACIÓN NSFW POR GRUPO
    // -------------------------------------------------------------------

    if (isGroup) {
        const nsfwEnabled = await gestorGrupos.obtenerEstadoNSFW(jid);

        if (!nsfwEnabled) {
            return sock.sendMessage(
                jid,
                {
                    text: `> ⛔ *Bloqueo:* » ${NSFW_ATREVIDO_SEARCH.error_nsfw_off}`,
                },
                { quoted: message }
            );
        }
    }
    // Si no es un grupo, o si es un grupo y nsfwEnabled es true, el flujo continúa.

    // -------------------------------------------------------------------
    // 1. Argument Check (Usa NSFW_ATREVIDO_SEARCH.sin_argumentos)
    // -------------------------------------------------------------------

    if (!text) {
        return sock.sendMessage(
            jid,
            {
                text:
                    `> ✦ *Error:* » ${NSFW_ATREVIDO_SEARCH.sin_argumentos}\n` +
                    `> ⴵ *Ejemplo:* » ${currentPrefix}${commandAlias} ${ejemploBusqueda}`,
            },
            { quoted: message }
        );
    } 
    // -------------------------------------------------------------------

    try {
        // 3. Initial Reaction + Mensaje de Proceso (BUSCANDO)
        await sock.sendMessage(jid, {
            react: { text: "🔍", key: message.key },
        });
        await sock.sendMessage(
            jid,
            {
                text: `> 💫 *Estado:* » ${NSFW_ATREVIDO_SEARCH.buscando}`,
            },
            { quoted: message }
        ); 

        // Llama a la función de búsqueda
        const res = await xnxxsearch(text);
        const json = res.result; 

        // Lógica para guardar las URLs para una posible descarga posterior
        const vids_ = {
            from: message.key.participant || jid,
            urls: [],
        };

        if (!global.videoListXXX) {
            global.videoListXXX = [];
        } 
        
        // Eliminar lista previa del mismo usuario
        global.videoListXXX = global.videoListXXX.filter(
            (v) => v.from !== vids_.from
        );

        let cap = `*${NSFW_ATREVIDO_SEARCH.exito}*\n\n`;
        cap += `*Búsqueda:* _${text.toUpperCase()}_\n\n`;
        let count = 1;

        for (const v of json) {
            vids_.urls.push(v.link); 
            
            // --- APLICACIÓN DE LA ESTÉTICA SOLICITADA ---
            cap += ` *「${count}」 ${v.title}*\n\n`; 
            cap += `> ✦ *Detalles:* » ${v.durationQuality}\n`;
            cap += `> ⴵ *Vistas/Tiempo:* » ${v.viewsAndDate}\n`;
            cap += `> 🔗 *Enlace:* » ${v.link}\n`; 
            cap += "\n" + "—" + "\n"; 
            count++;
            if (count > 10) break;
        } 
        
        // Guardar la nueva lista
        global.videoListXXX.push(vids_); 

        // 4. Envío Final de Resultados (Éxito)
        await sock.sendMessage(
            jid,
            {
                text:
                    cap.trim() +
                    `\n\n*😈 Para descargar, usa: ${currentPrefix}${downloadCommandAlias} [número] (Ejemplo: ${currentPrefix}${downloadCommandAlias} 1)*`,
            },
            { quoted: message }
        );

        await sock.sendMessage(jid, {
            react: { text: "✅", key: message.key },
        });
    } catch (e) {
        console.error("Error en xnxxsearch:", e); 
        
        // 5. Manejo de Fallos
        await sock.sendMessage(jid, {
            react: { text: "❌", key: message.key },
        });

        let errorMessage;
        const usageExampleMsg = `> ⴵ *Ejemplo:* » ${currentPrefix}${commandAlias} ${ejemploBusqueda}`;

        if (e.message && e.message.includes("No se encontraron resultados")) {
            errorMessage = `${NSFW_ATREVIDO_SEARCH.error_no_encontrado}`;
        } else {
            errorMessage = `${NSFW_ATREVIDO_SEARCH.error_general}`;
        }

        await sock.sendMessage(
            jid,
            {
                text: `> 💔 *Fallo:* » ${errorMessage}\n` + usageExampleMsg,
            },
            { quoted: message }
        );
    }
};

const command = {
    // Nombres de comandos sin el prefijo (punto)
    command: ["xnxxsearch", "xnxxs"],
    name: "xnxxsearch",
    category: "nsfw",
    description: "Busca videos en XNXX. (Modo discreto y atrevido)",
    isGroup: true,    // ⚠️ Asegurado que solo se active en grupos
    isPrivate: false, // ⚠️ Asegurado que no sea accesible en privado (o ajústalo si aplica)
    isAdmin: false,   // No requiere ser admin para usarlo (si está activado)
    execute,
    xnxxsearch,
};

module.exports = command;