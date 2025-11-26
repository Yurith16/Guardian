const { iniciarConexion } = require('./core/conexion');
const GestorComandos = require('./core/comandos');
const Logger = require('./utils/logger');
const Config = require('./config/bot.json');

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
    }

    async iniciar() {
        try {
            Logger.info('🛡️ Iniciando GuardianBot...');

            console.log('🔍 Paso 1: Cargando configuración...');
            console.log('Config:', JSON.stringify(Config, null, 2));

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

        // Obtener el global owner de forma segura
        let globalOwner = '';
        if (typeof this.config.propietarios.global === 'object') {
            globalOwner = this.config.propietarios.global.numero || 'No configurado';
        } else {
            globalOwner = this.config.propietarios.global || 'No configurado';
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
        const globalStr = String(globalOwner).padEnd(20);
        const estadoStr = String(this.estado || 'conectado').padEnd(19);
        const comandosStr = String(this.gestorComandos?.contadorComandos || 0).padEnd(16);
        const subOwnersStr = String(subOwnersCount).padEnd(15);
        const inicioStr = new Date().toLocaleTimeString().padEnd(16);

        console.log(`
    ╔═══════════════════════════════════════╗
    ║              🛡️ GUARDIAN BOT          ║
    ╠═══════════════════════════════════════╣
    ║  🤖 Nombre: ${nombreStr} ║
    ║  📦 Versión: v${versionStr} ║
    ║  ⚡ Prefix: ${prefixStr} ║
    ║  👑 Owner: ${globalStr} ║
    ║  🔧 Estado: ${estadoStr} ║
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
}

// Crear instancia global para acceso desde comandos
const botInstance = new GuardianBot();

// Manejo graceful de cierre
process.on('SIGINT', async () => {
    Logger.info('🛑 Apagando GuardianBot...');
    process.exit(0);
});

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