const { iniciarConexion, ManejadorConexion } = require('./core/conexion');
const GestorComandos = require('./core/comandos');
const Logger = require('./utils/logger');
const Config = require('./config/bot.json');
const fs = require('fs');
const path = require('path');

// Crear carpeta de logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

class GuardianBot {
    constructor() {
        this.config = Config;
        this.gestorComandos = new GestorComandos();
        this.socket = null;
        this.manejadorConexion = null;
        this.estado = 'iniciando';
        this.metrics = {
            inicio: new Date(),
            mensajesProcesados: 0,
            comandosEjecutados: 0
        };

        this.configurarManejoSenales();
    }

    async iniciar() {
        try {
            Logger.info('🛡️ Iniciando GuardianBot...');

            // Verificar si está en PM2
            if (process.env.PM2 === 'true') {
                Logger.info('🚀 Ejecutando en PM2');
            }

            console.log('🔍 Cargando comandos...');
            await this.gestorComandos.cargarComandos();

            // Verificar si se cargaron comandos
            if (this.gestorComandos.contadorComandos === 0) {
                Logger.warn('⚠️ No se cargaron comandos. Verifica la carpeta plugins/');
            } else {
                Logger.info(`✅ ${this.gestorComandos.contadorComandos} comandos cargados`);
            }

            // Iniciar conexión WhatsApp
            console.log('🔍 Iniciando conexión WhatsApp...');
            this.manejadorConexion = new ManejadorConexion(this);
            this.socket = await this.manejadorConexion.iniciar();
            this.estado = 'conectado';

            this.mostrarBanner();
            Logger.info('🚀 GuardianBot completamente operativo');

        } catch (error) {
            console.error('💥 ERROR al iniciar:', error);
            Logger.error('💥 Error crítico al iniciar:', error);

            // En PM2, esperar antes de reiniciar
            if (process.env.PM2 === 'true') {
                setTimeout(() => process.exit(1), 5000);
            } else {
                process.exit(1);
            }
        }
    }

    configurarManejoSenales() {
        // Manejo graceful de cierre para PM2
        process.on('SIGINT', async () => {
            Logger.info('🛑 Apagando GuardianBot (SIGINT)...');
            await this.cerrarGraceful();
        });

        process.on('SIGTERM', async () => {
            Logger.info('🛑 Apagando GuardianBot (SIGTERM)...');
            await this.cerrarGraceful();
        });

        process.on('SIGUSR2', async () => {
            Logger.info('🔁 Reinicio graceful (SIGUSR2)...');
            await this.cerrarGraceful();
        });
    }

    async cerrarGraceful() {
        try {
            if (this.manejadorConexion) {
                await this.manejadorConexion.cerrarConexion();
            }
            Logger.info('✅ GuardianBot cerrado correctamente');
            process.exit(0);
        } catch (error) {
            Logger.error('Error en cierre graceful:', error);
            process.exit(1);
        }
    }

    async procesarMensaje(message) {
        try {
            this.metrics.mensajesProcesados++;
            Logger.debug(`📨 Mensaje recibido [Total: ${this.metrics.mensajesProcesados}]`);

            // ✅ VERIFICACIÓN ROBUSTA DEL SOCKET
            let socket = this.obtenerSocketVerificado();
            if (!socket) {
                Logger.error('❌ No hay socket disponible, omitiendo mensaje');
                return;
            }

            // Pasar el mensaje al gestor de comandos
            await this.gestorComandos.ejecutarComando(socket, message);

        } catch (error) {
            Logger.error('❌ Error procesando mensaje:', error);
            
            // ✅ INTENTAR RECUPERAR CONEXIÓN SI ES ERROR DE SOCKET
            if (error.message.includes('Connection Closed') || error.message.includes('socket') || error.message.includes('not connected')) {
                Logger.warn('🔄 Error de conexión detectado, intentando recuperar...');
                await this.reconectarSocket();
            }
        }
    }

    // ✅ MÉTODO PARA OBTENER SOCKET VERIFICADO
    obtenerSocketVerificado() {
        if (!this.manejadorConexion) {
            Logger.error('❌ Manejador de conexión no disponible');
            return null;
        }

        // Obtener socket verificado
        const socket = this.manejadorConexion.obtenerSocket();
        
        if (!socket) {
            Logger.warn('⚠️ Socket no disponible, intentando reconexión automática');
            this.reconectarSocket();
            return null;
        }

        return socket;
    }

    // ✅ RECONEXIÓN DE SOCKET
    async reconectarSocket() {
        try {
            Logger.info('🔄 Intentando reconexión automática...');
            
            // Cerrar conexión anterior si existe
            if (this.manejadorConexion) {
                await this.manejadorConexion.cerrarConexion();
            }
            
            // Crear nueva conexión
            this.manejadorConexion = new ManejadorConexion(this);
            this.socket = await this.manejadorConexion.iniciar();
            this.estado = 'conectado';
            
            Logger.info('✅ Reconexión exitosa');
            return true;
        } catch (error) {
            Logger.error('❌ Error en reconexión:', error);
            this.estado = 'desconectado';
            return false;
        }
    }

    mostrarBanner() {
        const { nombre, version, prefix } = this.config.bot;

        // Obtener global owners count de forma segura
        let globalOwnersCount = 0;
        if (Array.isArray(this.config.propietarios?.global)) {
            globalOwnersCount = this.config.propietarios.global.length;
        } else if (this.config.propietarios?.global) {
            globalOwnersCount = 1;
        }

        // Obtener subOwners count de forma segura
        let subOwnersCount = 0;
        if (Array.isArray(this.config.propietarios?.subOwners)) {
            subOwnersCount = this.config.propietarios.subOwners.length;
        }

        // Convertir a string y asegurar que tenga longitud
        const nombreStr = String(nombre || '🛡️ Guardian Bot').padEnd(20);
        const versionStr = String(version || '1.0.0').padEnd(18);
        const prefixStr = String(prefix || '.').padEnd(20);
        const globalStr = String(`${globalOwnersCount} owners`).padEnd(20);
        const estadoStr = String(this.estado || 'conectado').padEnd(19);
        const comandosStr = String(this.gestorComandos?.contadorComandos || 0).padEnd(16);
        const subOwnersStr = String(subOwnersCount).padEnd(15);
        const inicioStr = new Date().toLocaleTimeString().padEnd(16);
        const pm2Str = String(process.env.PM2 === 'true' ? 'PM2 🚀' : 'Node.js').padEnd(16);

        console.log(`
    ╔═══════════════════════════════════════╗
    ║              🛡️ GUARDIAN BOT          ║
    ╠═══════════════════════════════════════╣
    ║  🤖 Nombre: ${nombreStr} ║
    ║  📦 Versión: v${versionStr} ║
    ║  ⚡ Prefix: ${prefixStr} ║
    ║  👑 Global Owners: ${globalStr} ║
    ║  🔧 Estado: ${estadoStr} ║
    ║  🚀 Entorno: ${pm2Str} ║
    ╠═══════════════════════════════════════╣
    ║  📊 Comandos: ${comandosStr} ║
    ║  👥 Sub-Owners: ${subOwnersStr} ║
    ║  🕒 Inicio: ${inicioStr} ║
    ╚═══════════════════════════════════════╝
        `);
    }

    // Método para obtener el socket (útil para plugins)
    obtenerSocket() {
        return this.obtenerSocketVerificado();
    }

    // Método para obtener configuración
    obtenerConfig() {
        return this.config;
    }

    // Método para obtener métricas
    obtenerMetrics() {
        return this.metrics;
    }

    // Método para obtener gestor de comandos
    obtenerGestorComandos() {
        return this.gestorComandos;
    }

    // ✅ Método para obtener manejador de conexión
    obtenerManejadorConexion() {
        return this.manejadorConexion;
    }
}

// Crear instancia global para acceso desde comandos
const botInstance = new GuardianBot();

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
    Logger.error('💥 Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
    Logger.error('❌ Promesa rechazada:', reason);
});

// Iniciar la aplicación
botInstance.iniciar();

module.exports = botInstance;