const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const Logger = require('../utils/logger');
const Config = require('../config/bot.json');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.rutaDB = path.resolve(Config.database.ruta);
        this.asegurarDirectorioDB();
    }

    asegurarDirectorioDB() {
        const dir = path.dirname(this.rutaDB);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async conectar() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.rutaDB, (err) => {
                if (err) {
                    Logger.error('Error conectando a la base de datos:', err);
                    reject(err);
                } else {
                    Logger.info('✅ Base de datos conectada');
                    this.inicializarTablas().then(resolve).catch(reject);
                }
            });
        });
    }

    async inicializarTablas() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS grupos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jid TEXT UNIQUE NOT NULL,
                nombre TEXT,
                descripcion TEXT,
                creado_por TEXT,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                configuracion TEXT DEFAULT '{}',
                activo BOOLEAN DEFAULT 1
            )`,

            `CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE NOT NULL,
                nombre TEXT,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultima_actividad DATETIME,
                nivel_permisos INTEGER DEFAULT 10,
                estadisticas TEXT DEFAULT '{}'
            )`,

            `CREATE TABLE IF NOT EXISTS configuraciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grupo_jid TEXT,
                clave TEXT NOT NULL,
                valor TEXT,
                UNIQUE(grupo_jid, clave)
            )`,

            `CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                usuario TEXT,
                grupo_jid TEXT,
                accion TEXT,
                detalles TEXT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of queries) {
            await this.ejecutar(query);
        }

        Logger.info('✅ Tablas de base de datos inicializadas');
    }

    ejecutar(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    obtener(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    obtenerTodos(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async cerrar() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        Logger.info('🔒 Base de datos cerrada');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // Métodos específicos para GuardianBot
    async registrarGrupo(jid, nombre, creadoPor) {
        const query = `INSERT OR REPLACE INTO grupos (jid, nombre, creado_por) VALUES (?, ?, ?)`;
        return await this.ejecutar(query, [jid, nombre, creadoPor]);
    }

    async obtenerGrupo(jid) {
        return await this.obtener('SELECT * FROM grupos WHERE jid = ?', [jid]);
    }

    async guardarConfiguracion(grupoJid, clave, valor) {
        const query = `INSERT OR REPLACE INTO configuraciones (grupo_jid, clave, valor) VALUES (?, ?, ?)`;
        return await this.ejecutar(query, [grupoJid, clave, valor]);
    }

    async obtenerConfiguracion(grupoJid, clave) {
        const resultado = await this.obtener(
            'SELECT valor FROM configuraciones WHERE grupo_jid = ? AND clave = ?',
            [grupoJid, clave]
        );
        return resultado ? resultado.valor : null;
    }

    async registrarLog(tipo, usuario, grupoJid, accion, detalles) {
        const query = `INSERT INTO logs (tipo, usuario, grupo_jid, accion, detalles) VALUES (?, ?, ?, ?, ?)`;
        return await this.ejecutar(query, [tipo, usuario, grupoJid, accion, detalles]);
    }
}

module.exports = DatabaseManager;