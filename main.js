const { iniciarConexion } = require('./core/conexion');
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
        this.estado = 'iniciando';
        this.metrics = {
            inicio: new Date(),
            mensajesProcesados: 0,
            comandosEjecutados: 0
        };

        // Manejo de señales para PM2
        this.configurarManejoSenales();
    }

    async iniciar() {
        try {
            Logger.info('🛡️ Iniciando GuardianBot...');

            // Verificar si está en PM2
            if (process.env.PM2 === 'true') {
                Logger.info('🚀 Ejecutando en PM2');
            }

            console.log('🔍 Paso 1: Cargando configuración...');

            // Cargar comandos primero
            console.log('🔍 Paso 2: Cargando comandos...');
            await this.gestorComandos.cargarComandos();

            // Verificar si se cargaron comandos
            if (this.gestorComandos.contadorComandos === 0) {
                Logger.warn('⚠️ No se cargaron comandos. Verifica la carpeta plugins/');
            } else {
                Logger.info(`✅ ${this.gestorComandos.contadorComandos} comandos cargados`);
            }

            // Iniciar conexión WhatsApp
            console.log('🔍 Paso 3: Iniciando conexión WhatsApp...');
            this.socket = await iniciarConexion(this);
            this.estado = 'conectado';

            this.mostrarBanner();
            Logger.info('🚀 GuardianBot completamente operativo');

        } catch (error) {
            console.error('💥 ERROR COMPLETO:', error);
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
            if (this.socket) {
                Logger.info('🔌 Cerrando conexión WhatsApp...');
                await this.socket.ws.close();
            }
            Logger.info('✅ GuardianBot cerrado correctamente');
            process.exit(0);
        } catch (error) {
            Logger.error('Error en cierre graceful:', error);
            process.exit(1);
        }
    }

    // ✅ MÉTODO QUE FALTABA - Procesar mensajes recibidos
    async procesarMensaje(message) {
        try {
            this.metrics.mensajesProcesados++;

            console.log(`📨 Mensaje recibido [Total: ${this.metrics.mensajesProcesados}]`);

            // Pasar el mensaje al gestor de comandos para procesamiento
            if (this.socket) {
                await this.gestorComandos.ejecutarComando(this.socket, message);
            } else {
                console.log('❌ Socket no disponible para procesar mensaje');
            }

        } catch (error) {
            console.error('❌ Error en procesarMensaje:', error.message);
            Logger.error('❌ Error procesando mensaje:', error);
        }
    }

    mostrarBanner() {
        const { nombre, version, prefix } = this.config.bot;

        // Obtener global owners count de forma segura
        let globalOwnersCount = 0;
        if (Array.isArray(this.config.propietarios.global)) {
            globalOwnersCount = this.config.propietarios.global.length;
        } else if (this.config.propietarios.global) {
            globalOwnersCount = 1;
        }

        // Obtener subOwners count de forma segura
        let subOwnersCount = 0;
        if (Array.isArray(this.config.propietarios.subOwners)) {
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
        return this.socket;
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