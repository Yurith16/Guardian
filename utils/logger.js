const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class Logger {
    static niveles = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    static nivelActual = 'info';
    static archivoLog = path.join(__dirname, '../logs/guardian.log');

    static asegurarDirectorioLogs() {
        const logsDir = path.dirname(this.archivoLog);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    static escribirArchivo(nivel, mensaje) {
        this.asegurarDirectorioLogs();

        const timestamp = new Date().toISOString();
        const linea = `[${timestamp}] [${nivel.toUpperCase()}] ${mensaje}\n`;

        fs.appendFileSync(this.archivoLog, linea, 'utf8');
    }

    static log(nivel, mensaje) {
        if (this.niveles[nivel] > this.niveles[this.nivelActual]) return;

        const colores = {
            error: chalk.red,
            warn: chalk.yellow,
            info: chalk.blue,
            debug: chalk.gray
        };

        const timestamp = chalk.gray(new Date().toLocaleTimeString());
        const nivelColor = colores[nivel] || chalk.white;
        const mensajeFormateado = `${timestamp} ${nivelColor(`[${nivel.toUpperCase()}]`)} ${mensaje}`;

        console.log(mensajeFormateado);
        this.escribirArchivo(nivel, mensaje);
    }

    static error(mensaje) {
        this.log('error', mensaje);
    }

    static warn(mensaje) {
        this.log('warn', mensaje);
    }

    static info(mensaje) {
        this.log('info', mensaje);
    }

    static debug(mensaje) {
        this.log('debug', mensaje);
    }

    static setNivel(nivel) {
        if (this.niveles[nivel] !== undefined) {
            this.nivelActual = nivel;
        }
    }

    // Método child para compatibilidad con Baileys
    static child() {
        return {
            level: this.nivelActual,
            trace: () => {},
            debug: (msg) => this.debug(msg),
            info: (msg) => this.info(msg),
            warn: (msg) => this.warn(msg),
            error: (msg) => this.error(msg),
            fatal: (msg) => this.error(msg),
            child: () => this.child()
        };
    }
}

module.exports = Logger;