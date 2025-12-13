const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const qrcode = require('qrcode-terminal')
const ManejadorAntispam = require('./seguridad_antispam');
const ManejadorAntilink2 = require('./seguridad_antilink2');
const { ManejadorMute, setFuncionesGlobales } = require('./seguridad_mute');
const ManejadorEventosGrupo = require('./manejador_eventos');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys")
const { Boom } = require('@hapi/boom')
const pino = require("pino")
const NodeCache = require('node-cache')
const Logger = require('../utils/logger')
const ManejadorSeguridad = require('./seguridad')

const SESSION_FOLDER = "./sessions"

let reconectando = false

class ManejadorConexion {
    constructor(guardianBot) {
        this.guardianBot = guardianBot
        this.sock = null
        this.manejadorAntispam = new ManejadorAntispam();
        this.manejadorMute = new ManejadorMute();
        this.manejadorEventos = new ManejadorEventosGrupo();
        this.estaConectado = false
        this.reconexionIntentos = 0
        this.maxReconexionIntentos = 5
        this.qrCode = null
        this.intentosSesionInvalida = 0
        this.maxIntentosSesionInvalida = 3
        this.manejadorSeguridad = new ManejadorSeguridad()
        this.manejadorAntilink2 = new ManejadorAntilink2();
        this.lastActivity = Date.now()

        // ✅ CONFIGURAR FUNCIONES GLOBALES PARA MUTE
        this.configurarFuncionesGlobales();

        // ✅ Iniciar heartbeat automático
        this.iniciarHeartbeat()
    }

    // ✅ CONFIGURAR FUNCIONES GLOBALES PARA MUTE
    configurarFuncionesGlobales() {
        try {
            if (setFuncionesGlobales) {
                setFuncionesGlobales({
                    obtenerGestorComandos: () => {
                        return this.guardianBot?.obtenerGestorComandos?.() || null;
                    },
                    obtenerBotInstance: () => {
                        return this.guardianBot || null;
                    }
                });
                Logger.info('✅ Funciones globales para mute configuradas');
            } else {
                Logger.warn('⚠️ setFuncionesGlobales no disponible en ManejadorMute');
            }
        } catch (error) {
            Logger.error('❌ Error configurando funciones globales:', error);
        }
    }

    // ✅ HEARTBEAT AUTOMÁTICO
    iniciarHeartbeat() {
        setInterval(() => {
            if (this.sock && this.estaConectado) {
                try {
                    // Mantener presencia 'available' cada minuto
                    this.sock.sendPresenceUpdate('available')
                    this.lastActivity = Date.now()
                } catch (error) {
                    Logger.error('💔 Heartbeat falló:', error.message)
                    this.estaConectado = false
                    this.reconectarAutomatico()
                }
            }
        }, 60000) // 1 minuto
    }

    // ✅ VERSIÓN SIMPLIFICADA - Solo verifica que existe creds.json
    existeSesion() {
        try {
            const credsPath = path.join(SESSION_FOLDER, "creds.json")
            const existe = fs.existsSync(SESSION_FOLDER) && fs.existsSync(credsPath)

            if (existe) {
                const stats = fs.statSync(credsPath)
                if (stats.size > 10) {
                    return true
                }
            }
            return false
        } catch (error) {
            return false
        }
    }

    async iniciar() {
        if (reconectando) return
        reconectando = true
        this.reconexionIntentos++

        try {
            console.log(chalk.yellow('🔄 Iniciando conexión con WhatsApp...'))

            if (!fs.existsSync(SESSION_FOLDER)) {
                fs.mkdirSync(SESSION_FOLDER, { recursive: true })
            }

            // ✅ VERIFICACIÓN SIMPLE DE SESIÓN
            const tieneSesion = this.existeSesion()

            if (tieneSesion) {
                console.log(chalk.green('✅ Sesión detectada. Intentando reconexión automática...'))

                if (this.intentosSesionInvalida >= this.maxIntentosSesionInvalida) {
                    console.log(chalk.red('\n❌ SESIÓN CORRUPTA DETECTADA'))
                    console.log(chalk.yellow('💡 Se borrará la sesión automáticamente e intentará un nuevo QR.\n'))
                    this.limpiarSesionCompleta(false); // Borrar sesión y forzar QR
                    this.intentosSesionInvalida = 0;
                    reconectando = false;
                    return;
                }
            } else {
                console.log(chalk.yellow('⚠️ No se encontró sesión. Usando código QR automático...'))
                this.intentosSesionInvalida = 0
            }

            const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
            const msgRetryCounterCache = new NodeCache()
            const { version } = await fetchLatestBaileysVersion()

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: !tieneSesion, // ✅ SOLO QR cuando no hay sesión
                browser: Browsers.ubuntu('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
                },
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async () => ({}),
                msgRetryCounterCache,
                // ✅ CORRECCIÓN 3: AUMENTAR TIMEOUTS PARA ESTABILIDAD
                defaultQueryTimeoutMs: 120000, 
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 20000,
                emitOwnEvents: true,
                fireInitQueries: true,
            })

            this.sock.ev.on('creds.update', saveCreds)
            this.configurarEventos()

            this.reconexionIntentos = 0
            reconectando = false
            return this.sock

        } catch (error) {
            console.error(chalk.red('❌ Error en conexión:'), error.message)

            // ✅ INCREMENTAR CONTADOR SI HAY SESIÓN PERO FALLA LA CONEXIÓN
            if (this.existeSesion() && !error.message.includes('No such file or directory')) {
                this.intentosSesionInvalida++
                console.log(chalk.yellow(`⚠️ Intento ${this.intentosSesionInvalida}/${this.maxIntentosSesionInvalida} con sesión existente`))
            }

            reconectando = false
            const delay = Math.min(2000 * this.reconexionIntentos, 10000)
            console.log(chalk.yellow(`🔄 Reconectando en ${delay/1000} segundos...`))
            setTimeout(() => this.iniciar(), delay)
        }
    }

    regenerarConexion() {
        if (this.sock) {
            this.sock.end()
        }
        setTimeout(() => this.iniciar(), 1000)
    }

    configurarEventos() {
        if (!this.sock) return

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update

            if (connection === 'open') {
                this.estaConectado = true
                this.reconexionIntentos = 0
                this.intentosSesionInvalida = 0
                reconectando = false
                this.qrCode = null
                this.lastActivity = Date.now()

                console.log(chalk.green('🎉 ¡Conectado a WhatsApp!'))
                console.log(chalk.cyan(`👤 Usuario: ${this.sock.user?.name || 'Bot'}`))

                setTimeout(() => {
                    if (this.guardianBot && this.guardianBot.mostrarBanner) {
                        this.guardianBot.mostrarBanner()
                    }
                }, 1000)
            }

            if (connection === 'close') {
                this.estaConectado = false
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode

                console.log(chalk.yellow(`🔌 Conexión cerrada. Razón: ${reason}`))

                // ✅ CORRECCIÓN 2: MANEJAR 440 (Unauthorized) COMO UNA SESIÓN EXPIRADA/INVÁLIDA
                if (reason === DisconnectReason.loggedOut || reason === 440) {
                    console.log(chalk.red(`❌ Sesión cerrada (${reason}). Borrando y reiniciando para generar nuevo QR.`))
                    this.limpiarSesionCompleta()
                } else {
                    console.log(chalk.yellow('🔄 Reconectando...'))
                    this.reconectar()
                }
            }

            // ✅ QR solo si NO hay sesión
            if (qr && !this.estaConectado && !this.existeSesion()) {
                this.qrCode = qr
                console.log(chalk.green('📱 Escanea este código QR con WhatsApp:'))
                qrcode.generate(qr, { small: true })
            }
        })

        this.sock.ev.on('messages.upsert', async (data) => {
            try {
                const { messages, type } = data
                if (type !== 'notify') return

                for (const message of messages) {
                    if (message.key.fromMe) continue;
                    const jid = message.key.remoteJid;
                    const texto = this.extraerTextoMensaje(message);

                    // Filtrar mensajes antiguos
                    if (message.messageTimestamp && (Date.now()/1000 - message.messageTimestamp > 120)) continue

                    // ========== VERIFICACIÓN MUTE (PRIMERO Y MÁS IMPORTANTE) ==========
                    if (jid && jid.endsWith('@g.us')) {
                        // ✅ VERIFICAR SI EL USUARIO ESTÁ SILENCIADO
                        const usuarioMuteado = await this.manejadorMute.verificarMute(this.sock, message);

                        // Si el usuario está silenciado, BLOQUEAR COMPLETAMENTE el mensaje
                        if (usuarioMuteado) {
                            const usuarioId = message.key.participant || message.key.remoteJid;
                            Logger.info(`🚫 MENSAJE BLOQUEADO - Usuario silenciado: ${usuarioId}`);
                            continue; // Saltar al siguiente mensaje, NO procesar más
                        }
                    }

                    // ========== VERIFICACIÓN ANTILINK2 (UNIVERSAL) PRIMERO ==========
                    if (jid.endsWith('@g.us')) {
                        // ✅ Antilink2 (universal - bloquea TODOS los enlaces)
                        if (this.manejadorAntilink2 && typeof this.manejadorAntilink2.verificarAntilink2 === 'function') {
                            const enlaceBloqueado = await this.manejadorAntilink2.verificarAntilink2(this.sock, message);

                            // Si antilink2 bloqueó el mensaje, NO verificar el antilink normal
                            if (enlaceBloqueado) {
                                continue; // Saltar al siguiente mensaje
                            }
                        }
                    }

                    // ========== VERIFICACIÓN ANTILINK NORMAL (SELECTIVO) ==========
                    if (jid.endsWith('@g.us') && texto) {
                        if (this.manejadorSeguridad && typeof this.manejadorSeguridad.verificarAntilink === 'function') {
                            await this.manejadorSeguridad.verificarAntilink(this.sock, message, jid, texto);
                        } else {
                            console.log(chalk.red('❌ manejadorSeguridad no está disponible'));
                        }
                    }

                    // ========== VERIFICACIÓN ANTISPAM ==========
                    if (jid.endsWith('@g.us')) {
                        await this.manejadorAntispam.verificarSpam(this.sock, message);
                    }

                    // ✅ CONTAR ARCHIVOS AUTOMÁTICAMENTE (Esto se hace antes de procesar comandos)
                    if (jid.endsWith('@g.us') && !message.key.fromMe) {
                        await this.contarArchivos(message, jid);
                    }

                    // ✅ CONTAR MENSAJES DE TEXTO (Se hace aquí si el mensaje no es un archivo)
                    if (texto && texto.length > 0 && jid.endsWith('@g.us') && !message.key.fromMe) {
                        const usuarioId = message.key.participant || message.key.remoteJid;
                        const gestorGrupos = this.guardianBot?.gestorComandos?.obtenerGestorGrupos();
                        if (gestorGrupos) {
                           gestorGrupos.registrarMensaje(jid, usuarioId);
                        }
                    }


                    // ========== PROCESAR COMANDOS DESPUÉS ==========
                    if (!message.key.fromMe && message.message) {
                        await this.guardianBot.procesarMensaje(message);
                    }
                }
            } catch (error) {
                if (!error.message.includes('Bad MAC')) {
                    console.error(chalk.red('❌ Error procesando mensaje:'), error.message)
                }
            }
        })

        this.sock.ev.on('group-participants.update', async (update) => {
            try {
                const { id, participants, action } = update;

                if (action === 'add') {
                    // Nuevos miembros
                    await this.manejadorEventos.manejarNuevoMiembro(this.sock, id, participants);
                } else if (action === 'remove') {
                    // Miembros que salen
                    for (const usuario of participants) {
                        await this.manejadorEventos.manejarMiembroSale(this.sock, id, usuario);
                    }
                }
            } catch (error) {
                Logger.error('Error en group-participants.update:', error);
            }
        });

        this.sock.ev.on('messages.update', () => {})
        this.sock.ev.on('message-receipt.update', () => {})
        this.sock.ev.on('presence.update', () => {})
    }

    // ✅ MÉTODO PARA CONTAR ARCHIVOS (Corregido y optimizado)
    async contarArchivos(message, jid) {
        try {
            const usuarioId = message.key.participant || message.key.remoteJid;
            const gestorGrupos = this.guardianBot?.gestorComandos?.obtenerGestorGrupos();

            if (!gestorGrupos) {
                Logger.debug('Gestor de grupos no disponible');
                return;
            }

            let tipoArchivo = null;

            // Detectar tipo de archivo
            if (message.message?.imageMessage) {
                tipoArchivo = 'imagenes';
            } else if (message.message?.videoMessage) {
                tipoArchivo = 'videos';
            } else if (message.message?.audioMessage) {
                tipoArchivo = 'audios';
            } else if (message.message?.documentMessage) {
                // Para documentos, solo contamos como 'documentos' si es algo legible
                const docType = message.message.documentMessage.mimetype || '';
                if (docType.includes('pdf') || docType.includes('word') || docType.includes('excel') || docType.includes('text') || docType.includes('application')) {
                    tipoArchivo = 'documentos';
                }
            } else if (message.message?.stickerMessage) {
                tipoArchivo = 'sticker';
            }

            // Si es un archivo válido, registrar
            if (tipoArchivo) {
                const registrado = await gestorGrupos.registrarArchivo(jid, usuarioId, tipoArchivo);

                if (registrado) {
                    Logger.debug(`📁 Archivo registrado: ${usuarioId} - ${tipoArchivo}`);
                } else if (tipoArchivo === 'sticker') {
                    // Si el registro de sticker falla, es por límite diario
                    // Aquí se puede añadir lógica para notificar al usuario, si lo deseas
                }
            }

        } catch (error) {
            Logger.debug('Error contando archivo:', error.message);
        }
    }

    // ✅ MÉTODO PARA EXTRAER TEXTO DE MENSAJES
    extraerTextoMensaje(message) {
        try {
            const msg = message.message
            if (!msg) return ''

            return msg.conversation 
                || msg.extendedTextMessage?.text 
                || msg.imageMessage?.caption
                || msg.videoMessage?.caption
                || msg.documentMessage?.caption
                || ''
        } catch (error) {
            return ''
        }
    }

    limpiarSesionCompleta(iniciarDespues = true) {
        try {
            if (fs.existsSync(SESSION_FOLDER)) {
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true })
                console.log(chalk.yellow('🗑️ Sesión eliminada'))
                this.intentosSesionInvalida = 0
            }
        } catch (error) {
            console.error(chalk.red('Error limpiando sesión:'), error)
        }

        this.reconexionIntentos = 0

        if (iniciarDespues) {
            console.log(chalk.yellow('🔄 Reiniciando conexión...'))
            setTimeout(() => this.iniciar(), 3000)
        }
    }

    reconectar() {
        if (this.reconexionIntentos >= this.maxReconexionIntentos) {
            console.log(chalk.red('❌ Máximo de intentos de reconexión alcanzado'))
            console.log(chalk.yellow('🔄 Forzando limpieza de sesión y reinicio completo...'))
            this.limpiarSesionCompleta()
            return
        }

        // ✅ CORRECCIÓN 1: Asegurar un delay mínimo para evitar el "flapping"
        // Intentos 0: delay 1s, Intento 1: delay 2s, Intento 2: delay 4s...
        const delay = Math.min(1000 * (2 ** this.reconexionIntentos), 10000) 
        console.log(chalk.yellow(`🔄 Reconectando en ${delay/1000}s...`))

        setTimeout(() => this.iniciar(), delay)
    }

    // ✅ RECONEXIÓN AUTOMÁTICA
    reconectarAutomatico() {
        if (!this.estaConectado) {
            console.log(chalk.yellow('🔄 Detección de conexión caída - Reconectando automáticamente...'))
            this.reconectar()
        }
    }

    async cerrarConexion() {
        console.log(chalk.yellow('🛑 Cerrando conexión...'))
        this.estaConectado = false
        reconectando = false

        if (this.sock) {
            try {
                await this.sock.end()
            } catch (error) {
                console.error(chalk.red('Error cerrando:'), error)
            }
        }
    }

    // ✅ SOCKET VERIFICADO - EVITA CONNECTION CLOSED
    obtenerSocket() {
        // Mejorar la estabilidad solo cuando el bot está conectado o intentando activamente
        if (!this.sock || !this.estaConectado) {
            // No iniciar reconexión aquí para evitar spam de reconexión si ya está en el ciclo 'close'
            Logger.warn('⚠️ Socket no disponible para comandos.')
            return null
        }

        // Simplemente devolver el socket, la reconexión se maneja en 'connection.update' y 'iniciarHeartbeat'
        return this.sock;
    }

    obtenerEstadoConexion() {
        return this.estaConectado && this.sock !== null
    }

    // ✅ OBTENER MANEJADOR MUTE (PARA DEBUGGING)
    obtenerManejadorMute() {
        return this.manejadorMute;
    }
}

async function iniciarConexion(guardianBot) {
    const manejador = new ManejadorConexion(guardianBot)
    return await manejador.iniciar()
}

module.exports = { iniciarConexion, ManejadorConexion }