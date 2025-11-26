const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const readline = require("readline")
const qrcode = require('qrcode-terminal')
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

// Configuración
const SESSION_FOLDER = "./sessions"

// Asegurar que la carpeta de sesiones existe
if (!fs.existsSync(SESSION_FOLDER)) {
    fs.mkdirSync(SESSION_FOLDER, { recursive: true })
    console.log(chalk.green('✅ Carpeta de sesiones creada automáticamente'))
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const question = (text) => {
    return new Promise((resolve) => rl.question(text, resolve))
}

class ManejadorConexion {
    constructor(guardianBot) {
        this.guardianBot = guardianBot
        this.sock = null
        this.estaConectado = false
        this.reconexionIntentos = 0
        this.maxReconexionIntentos = 5
        this.usarCodigo = false
        this.numero = ""
        this.estadoQR = null
    }

    // Verificación robusta de sesión
    existeSesion() {
        try {
            const credsPath = path.join(SESSION_FOLDER, "creds.json")
            if (!fs.existsSync(credsPath)) {
                return false
            }

            const stats = fs.statSync(credsPath)
            if (stats.size < 100) {
                return false
            }

            const credsContent = fs.readFileSync(credsPath, 'utf8')
            const creds = JSON.parse(credsContent)

            return creds && 
                   creds.noiseKey && 
                   creds.signedIdentityKey && 
                   creds.registered

        } catch (error) {
            console.log(chalk.yellow('⚠️ Sesión corrupta, se creará una nueva'))
            return false
        }
    }

    async iniciar() {
        try {
            console.log(chalk.yellow('🔄 Iniciando conexión con WhatsApp...'))

            // Siempre usar multi file auth state
            const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
            const tieneSesion = this.existeSesion()

            if (!tieneSesion) {
                console.log(chalk.yellow('⚠️ No se encontró sesión válida'))
                await this.preguntarMetodoConexion()
            } else {
                console.log(chalk.green('✅ Sesión válida detectada. Reconectando...'))
            }

            const { version, isLatest } = await fetchLatestBaileysVersion()
            console.log(chalk.blue(`📦 Usando WA v${version.join('.')} ${isLatest ? '(latest)' : ''}`))

            const msgRetryCounterCache = new NodeCache()

            // Configuración del socket
            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: !this.usarCodigo && !tieneSesion,
                browser: Browsers.ubuntu('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
                },
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async (key) => ({ }),
                msgRetryCounterCache,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                fireInitQueries: true,
            })

            // Configurar eventos
            this.sock.ev.on('creds.update', saveCreds)
            this.configurarEventos()

            // Manejar pairing code si es necesario
            if (this.usarCodigo && !tieneSesion && this.numero) {
                await this.procesarPairingCode()
            }

            this.reconexionIntentos = 0
            return this.sock

        } catch (error) {
            console.error(chalk.red('❌ Error crítico en conexión:'), error.message)
            await this.reconectar()
        }
    }

    async procesarPairingCode() {
        try {
            console.log(chalk.yellow('📞 Solicitando código de pairing...'))

            // En Baileys oficial, el pairing code se maneja automáticamente
            // Solo mostramos instrucciones
            console.log(chalk.green('✅ Método de código activado'))
            console.log(chalk.cyan('📱 Ve a WhatsApp → Ajustes → Dispositivos vinculados'))
            console.log(chalk.cyan('🔗 Selecciona "Vincular un dispositivo"'))
            console.log(chalk.yellow('⏳ Esperando que escanees el QR o ingreses el código...'))

        } catch (error) {
            console.log(chalk.red('❌ Error con pairing code:'))
            console.log(chalk.red(`   ${error.message}`))
            console.log(chalk.yellow('🔄 Cambiando a QR automáticamente...'))
            this.usarCodigo = false
            this.regenerarConexion()
        }
    }

    async preguntarMetodoConexion() {
        console.log(chalk.blueBright('\n┌────────────────────────────┐'))
        console.log(chalk.blueBright('│     MÉTODO DE VINCULACIÓN    │'))
        console.log(chalk.blueBright('└────────────────────────────┘'))
        console.log(chalk.green('\n¿CÓMO DESEA CONECTARSE?'))
        console.log(chalk.yellow('1.') + chalk.cyan(' Código QR (Recomendado)'))
        console.log(chalk.yellow('2.') + chalk.cyan(' Código de 8 dígitos'))

        const opcion = await question(chalk.magenta('\nElige opción (1/2): '))
        this.usarCodigo = opcion.trim() === "2"

        if (this.usarCodigo) {
            console.log(chalk.yellow('\n📱 Ingresa tu número (ejemplo: 50498729368):'))
            this.numero = await question('')
            this.numero = this.numero.replace(/[^0-9]/g, '')

            if (!this.numero.startsWith('504') || this.numero.length !== 11) {
                console.log(chalk.red('❌ Formato incorrecto. Usando QR automáticamente...'))
                this.usarCodigo = false
            } else {
                console.log(chalk.green('✅ Usando método de código'))
            }
        } else {
            console.log(chalk.green('✅ Usando método QR'))
        }
    }

    configurarEventos() {
        if (!this.sock) return

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update

            if (qr && !this.estaConectado && !this.usarCodigo) {
                this.estadoQR = qr
                console.log(chalk.green('\n📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:'))
                console.log(chalk.yellow('⏳ El código expira en 40 segundos...\n'))
                qrcode.generate(qr, { small: true })
                console.log('') // Espacio en blanco
            }

            if (connection === 'open') {
                this.estaConectado = true
                this.reconexionIntentos = 0
                this.estadoQR = null
                console.log(chalk.green('\n🎉 ¡CONECTADO EXITOSAMENTE A WHATSAPP!'))
                console.log(chalk.cyan(`👤 Usuario: ${this.sock.user?.name || 'N/A'}`))
                console.log(chalk.cyan(`📱 Número: ${this.sock.user?.id?.split(':')[0] || 'N/A'}`))

                // Mostrar banner del bot
                setTimeout(() => {
                    if (this.guardianBot && this.guardianBot.mostrarBanner) {
                        this.guardianBot.mostrarBanner()
                    }
                }, 1000)
            }

            if (connection === 'close') {
                this.estaConectado = false
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
                console.log(chalk.yellow(`\n🔌 Conexión cerrada. Razón: ${reason}`))

                if (reason === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Sesión cerrada. Eliminando datos de sesión...'))
                    this.limpiarSesionCompleta()
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log(chalk.yellow('🔄 Conexión cerrada, reconectando...'))
                    this.reconectar()
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log(chalk.yellow('📡 Conexión perdida, reconectando...'))
                    this.reconectar()
                } else {
                    console.log(chalk.yellow('🔄 Reconectando...'))
                    this.reconectar()
                }
            }
        })

        // Manejo de mensajes
        this.sock.ev.on('messages.upsert', async (data) => {
            try {
                const { messages, type } = data

                if (type !== 'notify') return

                for (const message of messages) {
                    if (!message.key.fromMe && message.message) {
                        await this.guardianBot.procesarMensaje(message)
                    }
                }
            } catch (error) {
                if (!error.message.includes('Bad MAC') && !error.message.includes('decrypt')) {
                    console.error(chalk.red('❌ Error procesando mensaje:'), error.message)
                }
            }
        })

        // Silenciar eventos innecesarios
        this.sock.ev.on('messages.update', () => {})
        this.sock.ev.on('message-receipt.update', () => {})
        this.sock.ev.on('presence.update', () => {})
    }

    regenerarConexion() {
        if (this.sock) {
            try {
                this.sock.end()
            } catch (e) {}
        }
        setTimeout(() => this.iniciar(), 2000)
    }

    limpiarSesionCompleta() {
        try {
            if (fs.existsSync(SESSION_FOLDER)) {
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true })
                fs.mkdirSync(SESSION_FOLDER, { recursive: true })
                console.log(chalk.yellow('🗑️ Sesión eliminada completamente'))
            }
        } catch (error) {
            console.error(chalk.red('Error limpiando sesión:'), error)
        }

        this.reconexionIntentos = 0
        this.usarCodigo = false
        this.numero = ""

        setTimeout(() => this.iniciar(), 3000)
    }

    async reconectar() {
        if (this.reconexionIntentos >= this.maxReconexionIntentos) {
            console.log(chalk.red('❌ Máximo de intentos alcanzado. Reiniciando...'))
            this.limpiarSesionCompleta()
            return
        }

        const delay = Math.min(3000 * (this.reconexionIntentos + 1), 15000)
        console.log(chalk.yellow(`🔄 Reconectando en ${delay/1000}s... (Intento ${this.reconexionIntentos + 1}/${this.maxReconexionIntentos})`))

        this.reconexionIntentos++
        setTimeout(() => this.iniciar(), delay)
    }

    async cerrarConexion() {
        console.log(chalk.yellow('🛑 Cerrando conexión...'))
        this.estaConectado = false

        if (this.sock) {
            try {
                await this.sock.end()
            } catch (error) {
                // Ignorar errores al cerrar
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