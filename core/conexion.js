const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const qrcode = require('qrcode-terminal')
const ManejadorAntispam = require('./seguridad_antispam');
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
        this.manejadorEventos = new ManejadorEventosGrupo();
        this.estaConectado = false
        this.reconexionIntentos = 0
        this.maxReconexionIntentos = 5
        this.qrCode = null
        this.intentosSesionInvalida = 0
        this.maxIntentosSesionInvalida = 3
        this.manejadorSeguridad = new ManejadorSeguridad() // ✅ INICIALIZAR AQUÍ
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
                    console.log(chalk.yellow('💡 Solución:'))
                    console.log(chalk.cyan('   1. Borra la carpeta "sessions" manualmente'))
                    console.log(chalk.cyan('   2. Reinicia el bot'))
                    console.log(chalk.cyan('   3. Escanea el código QR nuevamente\n'))

                    // En Docker/Pterodactyl no podemos esperar input, continuar automáticamente
                    console.log(chalk.magenta('⏳ Continuando automáticamente en 5 segundos...'))
                    await new Promise(resolve => setTimeout(resolve, 5000))
                    this.intentosSesionInvalida = 0
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
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 10000,
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
            if (this.existeSesion()) {
                this.intentosSesionInvalida++
                console.log(chalk.yellow(`⚠️ Intento ${this.intentosSesionInvalida}/${this.maxIntentosSesionInvalida} con sesión existente`))

                if (this.intentosSesionInvalida >= this.maxIntentosSesionInvalida) {
                    console.log(chalk.red('\n💡 La sesión parece corrupta. Si los errores continúan:'))
                    console.log(chalk.cyan('   - Borra la carpeta "sessions" manualmente'))
                    console.log(chalk.cyan('   - Reinicia el bot\n'))
                }
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

                if (reason === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Sesión cerrada. Borra la carpeta "sessions" y reinicia el bot'))
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

                    // ========== VERIFICACIÓN ANTILINK PRIMERO ==========
                    if (jid.endsWith('@g.us') && texto) {
                        // ✅ VERIFICAR QUE manejadorSeguridad EXISTA ANTES DE USARLO
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

        // ✅ AGREGAR AQUÍ EL MANEJADOR DE REACCIONES
        this.sock.ev.on('messages.reaction', async (reactions) => {
            for (const reaction of reactions) {
                try {
                    // Importar y usar el manejador de reacciones del comando play
                    const playHandler = require('../plugins/descargas/play.js');
                    if (playHandler.handleReaction) {
                        await playHandler.handleReaction(this.sock, reaction);
                    }
                } catch (error) {
                    console.error('Error procesando reacción:', error);
                }
            }
        });

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

    limpiarSesionCompleta() {
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

        console.log(chalk.yellow('🔄 Reiniciando conexión...'))
        setTimeout(() => this.iniciar(), 3000)
    }

    reconectar() {
        if (this.reconexionIntentos >= this.maxReconexionIntentos) {
            console.log(chalk.red('❌ Máximo de intentos alcanzado'))
            console.log(chalk.yellow('🔄 Reiniciando completamente...'))
            this.limpiarSesionCompleta()
            return
        }

        const delay = Math.min(2000 * this.reconexionIntentos, 10000)
        console.log(chalk.yellow(`🔄 Reconectando en ${delay/1000}s...`))

        setTimeout(() => this.iniciar(), delay)
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

    obtenerSocket() {
        return this.sock
    }

    obtenerEstadoConexion() {
        return this.estaConectado
    }
}

async function iniciarConexion(guardianBot) {
    const manejador = new ManejadorConexion(guardianBot)
    return await manejador.iniciar()
}

module.exports = { iniciarConexion, ManejadorConexion }