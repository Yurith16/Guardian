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
const Logger = require('../utils/logger')

const SESSION_FOLDER = "./sessions"

if (!fs.existsSync(SESSION_FOLDER)) {
    fs.mkdirSync(SESSION_FOLDER, { recursive: true })
    console.log(chalk.green('✅ Sesiones creadas'))
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

    existeSesion() {
        try {
            const credsPath = path.join(SESSION_FOLDER, "creds.json")
            if (!fs.existsSync(credsPath)) return false
            const stats = fs.statSync(credsPath)
            if (stats.size < 100) return false
            const credsContent = fs.readFileSync(credsPath, 'utf8')
            const creds = JSON.parse(credsContent)
            return creds && creds.noiseKey && creds.signedIdentityKey && creds.registered
        } catch (error) {
            console.log(chalk.yellow('⚠️ Sesión corrupta'))
            return false
        }
    }

    async iniciar() {
        try {
            console.log(chalk.yellow('🔄 Conectando WhatsApp...'))
            const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
            const tieneSesion = this.existeSesion()

            if (!tieneSesion) {
                console.log(chalk.yellow('⚠️ Sin sesión'))
                await this.preguntarMetodoConexion()
            } else {
                console.log(chalk.green('✅ Sesión detectada'))
            }

            const { version, isLatest } = await fetchLatestBaileysVersion()
            console.log(chalk.blue(`📦 WA v${version.join('.')}`))

            const msgRetryCounterCache = new NodeCache()

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

            this.sock.ev.on('creds.update', saveCreds)
            this.configurarEventos()

            if (this.usarCodigo && !tieneSesion && this.numero) {
                await this.procesarPairingCode()
            }

            this.reconexionIntentos = 0
            return this.sock

        } catch (error) {
            console.error(chalk.red('❌ Error conexión:'), error.message)
            await this.reconectar()
        }
    }

    async procesarPairingCode() {
        try {
            console.log(chalk.yellow('📞 Pairing code...'))
            console.log(chalk.green('✅ Código activado'))
            console.log(chalk.cyan('📱 WhatsApp → Dispositivos'))
            console.log(chalk.cyan('🔗 Vincular dispositivo'))
        } catch (error) {
            console.log(chalk.red('❌ Error código:'))
            console.log(chalk.red(`   ${error.message}`))
            this.usarCodigo = false
            this.regenerarConexion()
        }
    }

    async preguntarMetodoConexion() {
        console.log(chalk.blueBright('\n┌────────────────────────────┐'))
        console.log(chalk.blueBright('│     MÉTODO DE VINCULACIÓN    │'))
        console.log(chalk.blueBright('└────────────────────────────┘'))
        console.log(chalk.green('\n¿CÓMO CONECTARSE?'))
        console.log(chalk.yellow('1.') + chalk.cyan(' Código QR'))
        console.log(chalk.yellow('2.') + chalk.cyan(' Código 8 dígitos'))

        const opcion = await question(chalk.magenta('\nOpción (1/2): '))
        this.usarCodigo = opcion.trim() === "2"

        if (this.usarCodigo) {
            console.log(chalk.yellow('\n📱 Ingresa número:'))
            this.numero = await question('')
            this.numero = this.numero.replace(/[^0-9]/g, '')

            if (!this.numero.startsWith('504') || this.numero.length !== 11) {
                console.log(chalk.red('❌ Formato incorrecto. QR...'))
                this.usarCodigo = false
            } else {
                console.log(chalk.green('✅ Usando código'))
            }
        } else {
            console.log(chalk.green('✅ Usando QR'))
        }
    }

    configurarEventos() {
        if (!this.sock) return

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update

            if (qr && !this.estaConectado && !this.usarCodigo) {
                this.estadoQR = qr
                console.log(chalk.green('\n📱 ESCANEA QR:'))
                console.log(chalk.yellow('⏳ 40 segundos...\n'))
                qrcode.generate(qr, { small: true })
                console.log('')
            }

            if (connection === 'open') {
                this.estaConectado = true
                this.reconexionIntentos = 0
                this.estadoQR = null
                console.log(chalk.green('\n🎉 ¡CONECTADO!'))
                console.log(chalk.cyan(`👤 ${this.sock.user?.name || 'N/A'}`))
                console.log(chalk.cyan(`📱 ${this.sock.user?.id?.split(':')[0] || 'N/A'}`))

                setTimeout(() => {
                    if (this.guardianBot && this.guardianBot.mostrarBanner) {
                        this.guardianBot.mostrarBanner()
                    }
                }, 1000)
            }

            if (connection === 'close') {
                this.estaConectado = false
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
                console.log(chalk.yellow(`\n🔌 Cerrado. Razón: ${reason}`))

                if (reason === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Sesión cerrada'))
                    this.limpiarSesionCompleta()
                } else {
                    console.log(chalk.yellow('🔄 Reconectando...'))
                    this.reconectar()
                }
            }
        })

        this.sock.ev.on('messages.upsert', async (data) => {
            try {
                const { messages, type } = data
                if (type !== 'notify') return

                for (const message of messages) {
                    if (message.key.fromMe) continue;
                    const jid = message.key.remoteJid;
                    const texto = this.obtenerTextoMensaje(message);

                    if (!message.key.fromMe && message.message) {
                        await this.guardianBot.procesarMensaje(message);
                    }

                    if (jid.endsWith('@g.us') && texto) {
                        await this.verificarAntilink(message, jid, texto);
                    }
                }
            } catch (error) {
                if (!error.message.includes('Bad MAC') && !error.message.includes('decrypt')) {
                    console.error(chalk.red('❌ Error mensaje:'), error.message)
                }
            }
        })

        this.sock.ev.on('messages.update', () => {})
        this.sock.ev.on('message-receipt.update', () => {})
        this.sock.ev.on('presence.update', () => {})
    }

    obtenerTextoMensaje(mensaje) {
        if (mensaje.message?.conversation) return mensaje.message.conversation;
        if (mensaje.message?.extendedTextMessage?.text) return mensaje.message.extendedTextMessage.text;
        if (mensaje.message?.imageMessage?.caption) return mensaje.message.imageMessage.caption;
        if (mensaje.message?.videoMessage?.caption) return mensaje.message.videoMessage.caption;
        return '';
    }

    contieneEnlacesNoPermitidos(texto) {
        if (!texto || typeof texto !== 'string') return false;
        const dominiosPermitidos = [
            'youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 
            'vm.tiktok.com', 'vt.tiktok.com', 'twitter.com', 'x.com',
            'pinterest.com', 'facebook.com', 'fb.com', 'whatsapp.com'
        ];
        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.[a-z]{2,}(\/[^\s]*)?)/gi;
        const enlaces = texto.match(urlRegex);
        if (!enlaces) return false;

        for (const enlace of enlaces) {
            try {
                let dominio = enlace.toLowerCase();
                if (dominio.includes('://')) {
                    const url = new URL(dominio.includes('http') ? dominio : 'https://' + dominio);
                    dominio = url.hostname;
                } else if (dominio.startsWith('www.')) {
                    dominio = dominio.replace('www.', '');
                }
                dominio = dominio.split('/')[0];
                const esPermitido = dominiosPermitidos.some(perm => dominio.includes(perm));
                if (!esPermitido && dominio.includes('.') && dominio.length > 3) {
                    Logger.info(`🚫 Enlace bloqueado: ${dominio}`);
                    return true;
                }
            } catch (error) {
                continue;
            }
        }
        return false;
    }

    async verificarAntilink(mensaje, jid, texto) {
        try {
            let gestorGrupos;
            try {
                const bot = require('../main');
                const gestorComandos = bot.obtenerGestorComandos();
                gestorGrupos = gestorComandos.obtenerGestorGrupos();
            } catch (error) {
                return;
            }
            if (!gestorGrupos) return;

            let datosGrupo;
            try {
                datosGrupo = await gestorGrupos.obtenerDatos(jid);
            } catch (error) {
                return;
            }
            if (!datosGrupo) return;

            const antilinkActivo = datosGrupo.configuraciones?.antilink !== false;
            if (!antilinkActivo) return;

            if (this.contieneEnlacesNoPermitidos(texto)) {
                Logger.info(`🚫 Antilink activo en ${jid}`);
                try {
                    await this.sock.sendMessage(jid, { delete: mensaje.key });
                    const usuario = mensaje.key.participant || mensaje.key.remoteJid;
                    const userNum = usuario.split('@')[0];
                    const advertencia = `🚫 *ENLACE BLOQUEADO*\n\n@${userNum} enlace no permitido.\n\n🔗 YouTube, Instagram, TikTok\n🔗 Twitter, Pinterest, Facebook\n🔗 WhatsApp\n\n⚠️ Mensaje eliminado.`;
                    await this.sock.sendMessage(jid, { text: advertencia, mentions: [usuario] });
                    Logger.info(`✅ Mensaje eliminado: @${userNum}`);
                } catch (deleteError) {
                    Logger.error('❌ Error eliminando:', deleteError);
                }
            }
        } catch (error) {
            Logger.error('💥 Error antilink:', error);
        }
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
                console.log(chalk.yellow('🗑️ Sesión eliminada'))
            }
        } catch (error) {
            console.error(chalk.red('Error limpiando:'), error)
        }
        this.reconexionIntentos = 0
        this.usarCodigo = false
        this.numero = ""
        setTimeout(() => this.iniciar(), 3000)
    }

    async reconectar() {
        if (this.reconexionIntentos >= this.maxReconexionIntentos) {
            console.log(chalk.red('❌ Máximo intentos'))
            this.limpiarSesionCompleta()
            return
        }
        const delay = Math.min(3000 * (this.reconexionIntentos + 1), 15000)
        console.log(chalk.yellow(`🔄 Reconectando ${delay/1000}s...`))
        this.reconexionIntentos++
        setTimeout(() => this.iniciar(), delay)
    }

    async cerrarConexion() {
        console.log(chalk.yellow('🛑 Cerrando...'))
        this.estaConectado = false
        if (this.sock) {
            try {
                await this.sock.end()
            } catch (error) {}
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