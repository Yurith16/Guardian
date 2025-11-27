const Config = require('../config/bot.json');
const Logger = require('./logger');

class ManejadorPropietarios {
    constructor() {
        this.cargarPropietarios();
    }

    // Cargar propietarios con validación
    cargarPropietarios() {
        try {
            this.propietarios = Array.isArray(Config.propietarios?.global) 
                ? Config.propietarios.global 
                : [];

            this.subOwners = Array.isArray(Config.propietarios?.subOwners) 
                ? Config.propietarios.subOwners 
                : [];

            Logger.info(`👑 Manejador de Propietarios cargado: ${this.propietarios.length} globales, ${this.subOwners.length} sub-owners`);

        } catch (error) {
            Logger.error('❌ Error cargando propietarios:', error);
            this.propietarios = [];
            this.subOwners = [];
        }
    }

    // Verificar si un usuario es propietario global
    esPropietarioGlobal(userId) {
        if (!userId || this.propietarios.length === 0) return false;

        return this.propietarios.some(owner => {
            if (typeof owner === 'object') {
                return owner.numero === userId || owner.id === userId;
            }
            // Compatibilidad con estructura antigua (solo número)
            return owner === userId;
        });
    }

    // Verificar si un usuario es sub-owner
    esSubOwner(userId) {
        if (!userId || this.subOwners.length === 0) return false;

        return this.subOwners.some(owner => {
            if (typeof owner === 'object') {
                return owner.numero === userId || owner.id === userId;
            }
            // Compatibilidad con estructura antigua
            return owner === userId;
        });
    }

    // Verificar si es cualquier tipo de owner
    esOwner(userId) {
        return this.esPropietarioGlobal(userId) || this.esSubOwner(userId);
    }

    // Obtener lista de números de propietarios globales
    obtenerNumerosPropietariosGlobales() {
        return this.propietarios.map(owner => 
            typeof owner === 'object' ? owner.numero : owner
        );
    }

    // Obtener lista de números de todos los owners
    obtenerTodosLosNumeros() {
        const globales = this.obtenerNumerosPropietariosGlobales();
        const subs = this.subOwners.map(owner => 
            typeof owner === 'object' ? owner.numero : owner
        );
        return [...new Set([...globales, ...subs])]; // Eliminar duplicados
    }

    // Obtener información completa de owners
    obtenerInfoPropietarios() {
        return {
            globales: this.propietarios,
            subOwners: this.subOwners,
            total: this.propietarios.length + this.subOwners.length
        };
    }

    // Recargar propietarios (útil si se actualiza la configuración)
    recargar() {
        this.cargarPropietarios();
    }

    // Verificar permisos para comandos específicos
    tienePermisoComando(userId, comandoInfo) {
        if (!comandoInfo.isOwner) return true; // Comando público

        return this.esOwner(userId);
    }
}

module.exports = new ManejadorPropietarios();