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
        this.spamCount = new Map()
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
            return false
        }
    }

    async iniciar() {
        try {
            console.log(chalk.yellow('🔄 Conectando...'))
            const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
            const tieneSesion = this.existeSesion()

            if (!tieneSesion) {
                await this.preguntarMetodoConexion()
            }

            const { version } = await fetchLatestBaileysVersion()
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
            console.error(chalk.red('❌ Error:'), error.message)
            await this.reconectar()
        }
    }

    async procesarPairingCode() {
        try {
            console.log(chalk.yellow('📞 Código...'))
        } catch (error) {
            this.usarCodigo = false
            this.regenerarConexion()
        }
    }

    async preguntarMetodoConexion() {
        console.log(chalk.blueBright('\n┌────────────────────────────┐'))
        console.log(chalk.blueBright('│          CONEXIÓN           │'))
        console.log(chalk.blueBright('└────────────────────────────┘'))
        console.log(chalk.yellow('1.') + chalk.cyan(' QR'))
        console.log(chalk.yellow('2.') + chalk.cyan(' Código'))

        const opcion = await question(chalk.magenta('\nOpción: '))
        this.usarCodigo = opcion.trim() === "2"

        if (this.usarCodigo) {
            console.log(chalk.yellow('\n📱 Número:'))
            this.numero = await question('')
            this.numero = this.numero.replace(/[^0-9]/g, '')
            if (!this.numero.startsWith('504') || this.numero.length !== 11) {
                this.usarCodigo = false
            }
        }
    }

    configurarEventos() {
        if (!this.sock) return

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr && !this.estaConectado && !this.usarCodigo) {
                this.estadoQR = qr
                console.log(chalk.green('\n📱 ESCANEA QR:\n'))
                qrcode.generate(qr, { small: true })
            }

            if (connection === 'open') {
                this.estaConectado = true
                this.reconexionIntentos = 0
                this.estadoQR = null
                console.log(chalk.green('\n🎉 ¡CONECTADO!'))
                setTimeout(() => {
                    if (this.guardianBot && this.guardianBot.mostrarBanner) {
                        this.guardianBot.mostrarBanner()
                    }
                }, 1000)
            }

            if (connection === 'close') {
                this.estaConectado = false
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
                console.log(chalk.yellow(`\n🔌 Cerrado: ${reason}`))
                this.reconectar()
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
                if (!error.message.includes('Bad MAC')) {
                    console.error(chalk.red('❌ Error:'), error.message)
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
                const usuario = mensaje.key.participant || mensaje.key.remoteJid;
                const userKey = `${jid}_${usuario}`;
                
                // Contar spam
                const currentCount = this.spamCount.get(userKey) || 0;
                this.spamCount.set(userKey, currentCount + 1);
                
                // Eliminar mensaje inmediatamente
                try {
                    await this.sock.sendMessage(jid, { delete: mensaje.key });
                } catch (error) {}

                // Si es primer enlace, solo advertencia
                if (currentCount === 0) {
                    const advertencia = `@${usuario.split('@')[0]} no está permitido enviar enlaces`;
                    await this.sock.sendMessage(jid, { text: advertencia, mentions: [usuario] });
                }
                // Si son 3+ enlaces, acción fuerte
                else if (currentCount >= 3) {
                    await this.procesarSpamSevero(jid, usuario);
                    this.spamCount.delete(userKey);
                }

                // Resetear contador después de 1 minuto
                setTimeout(() => {
                    if (this.spamCount.get(userKey) === currentCount + 1) {
                        this.spamCount.delete(userKey);
                    }
                }, 60000);
            }
        } catch (error) {
            Logger.error('Error antilink:', error);
        }
    }

    async procesarSpamSevero(jid, usuario) {
        try {
            // Cerrar grupo
            await this.sock.groupSettingUpdate(jid, 'announcement');
            
            // Eliminar usuario
            await this.sock.groupParticipantsUpdate(jid, [usuario], 'remove');
            
            // Mensaje de acción
            await this.sock.sendMessage(jid, { 
                text: `🚫 Usuario eliminado por spam de enlaces` 
            });

            // Reabrir grupo después de 2 minutos
            setTimeout(async () => {
                try {
                    await this.sock.groupSettingUpdate(jid, 'not_announcement');
                } catch (error) {}
            }, 120000);

            Logger.info(`🚫 Usuario eliminado por spam: ${usuario} en ${jid}`);
        } catch (error) {
            Logger.error('Error procesando spam:', error);
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
            }
        } catch (error) {}
        this.reconexionIntentos = 0
        this.usarCodigo = false
        this.numero = ""
        setTimeout(() => this.iniciar(), 3000)
    }

    async reconectar() {
        if (this.reconexionIntentos >= this.maxReconexionIntentos) {
            this.limpiarSesionCompleta()
            return
        }
        const delay = Math.min(3000 * (this.reconexionIntentos + 1), 15000)
        this.reconexionIntentos++
        setTimeout(() => this.iniciar(), delay)
    }

    async cerrarConexion() {
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