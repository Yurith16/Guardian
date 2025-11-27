const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const readline = require("readline")
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const question = (text) => {
    return new Promise((resolve) => rl.question(text, resolve))
}

let usarCodigo = false
let numero = ""
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

                    await question(chalk.magenta('Presiona Enter después de borrar la carpeta "sessions"...'))
                    this.intentosSesionInvalida = 0
                }
            } else {
                console.log(chalk.yellow('⚠️ No se encontró sesión. Mostrando métodos de conexión...'))
                this.intentosSesionInvalida = 0
            }

            const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
            const msgRetryCounterCache = new NodeCache()
            const { version } = await fetchLatestBaileysVersion()

            // ✅ SOLO preguntar método si NO hay sesión
            if (!tieneSesion && (!state.creds.registered || Object.keys(state.creds).length === 0)) {
                await this.preguntarMetodoConexion()
            }

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: !usarCodigo && !tieneSesion,
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

            // ✅ SOLO mostrar pairing code si NO hay sesión
            if (usarCodigo && !tieneSesion) {
                setTimeout(async () => {
                    try {
                        if (this.sock && !state.creds.registered) {
                            console.log(chalk.yellow('📞 Solicitando código de pairing...'))

                            const code = await this.sock.requestPairingCode(numero.replace('+', ''))

                            console.log(chalk.black(chalk.bgGreen(` 🎯 CÓDIGO DE EMPAREJAMIENTO `)))
                            console.log(chalk.white.bgBlue(`         ${code}         `))
                            console.log(chalk.yellow(`\n📲 Instrucciones:`))
                            console.log(chalk.cyan(`1. WhatsApp → Ajustes → Dispositivos vinculados`))
                            console.log(chalk.cyan(`2. "Vincular un dispositivo"`))
                            console.log(chalk.cyan(`3. Ingresa: ${code}`))

                            setTimeout(() => {
                                if (!state.creds.registered && !this.estaConectado) {
                                    console.log(chalk.yellow('🔄 Código expirado, regenerando...'))
                                    this.regenerarPairingCode(state, saveCreds)
                                }
                            }, 40000)
                        }
                    } catch (error) {
                        console.log(chalk.red('❌ Error con pairing code:'))
                        console.log(chalk.red(`   ${error.message}`))
                        console.log(chalk.yellow('🔄 Cambiando a QR automáticamente...'))
                        usarCodigo = false
                        this.regenerarConexion()
                    }
                }, 3000)
            }

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

    async regenerarPairingCode(state, saveCreds) {
        try {
            if (this.sock && !state.creds.registered) {
                const newCode = await this.sock.requestPairingCode(numero.replace('+', ''))
                console.log(chalk.black(chalk.bgGreen(` 🎯 NUEVO CÓDIGO `)))
                console.log(chalk.white.bgBlue(`         ${newCode}         `))
                console.log(chalk.yellow(`⏰ Expira en 40 segundos...`))
            }
        } catch (error) {
            console.log(chalk.red('❌ Error generando nuevo código, cambiando a QR...'))
            usarCodigo = false
            this.regenerarConexion()
        }
    }

    regenerarConexion() {
        if (this.sock) {
            this.sock.end()
        }
        setTimeout(() => this.iniciar(), 1000)
    }

    async preguntarMetodoConexion() {
        console.log(chalk.blueBright('\n┌────────────────────────────┐'))
        console.log(chalk.blueBright('│     MÉTODO DE VINCULACIÓN    │'))
        console.log(chalk.blueBright('└────────────────────────────┘'))
        console.log(chalk.green('\n¿CÓMO DESEA CONECTARSE?'))
        console.log(chalk.yellow('1.') + chalk.cyan(' Código QR'))
        console.log(chalk.yellow('2.') + chalk.cyan(' Código de 8 dígitos'))

        const opcion = await question(chalk.magenta('\nElige opción (1/2): '))
        usarCodigo = opcion === "2"

        if (usarCodigo) {
            console.log(chalk.yellow('\n📱 Ingresa tu número (ejemplo: 50498729368):'))
            numero = await question('')
            numero = numero.replace(/[^0-9]/g, '')

            if (!numero.startsWith('504') || numero.length !== 11) {
                console.log(chalk.red('❌ Formato incorrecto. Usando QR...'))
                usarCodigo = false
            }
        } else {
            console.log(chalk.green('✅ Usando método QR'))
        }
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
            if (qr && !usarCodigo && !this.estaConectado && !this.existeSesion()) {
                this.qrCode = qr
                console.log(chalk.green('📱 Escanea el código QR con WhatsApp:'))
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

        usarCodigo = false
        numero = ""
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
        if (rl) {
            rl.close()
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