const Config = require('../config/bot.json');

class Helpers {
    static obtenerNumeroUsuario(mensaje) {
        const remitente = mensaje.key.participant || mensaje.key.remoteJid;
        return remitente.split('@')[0];
    }

    static esPropietario(numero) {
        return numero === Config.propietarios.global || 
               Config.propietarios.subOwners.includes(numero);
    }

    static esGrupo(jid) {
        return jid.endsWith('@g.us');
    }

    static obtenerNombreGrupo(jid) {
        return jid.split('@')[0];
    }

    static formatearTiempo(ms) {
        const segundos = Math.floor(ms / 1000);
        const minutos = Math.floor(segundos / 60);
        const horas = Math.floor(minutos / 60);
        const dias = Math.floor(horas / 24);

        if (dias > 0) return `${dias}d ${horas % 24}h`;
        if (horas > 0) return `${horas}h ${minutos % 60}m`;
        if (minutos > 0) return `${minutos}m ${segundos % 60}s`;
        return `${segundos}s`;
    }

    static sanitizarTexto(texto) {
        return texto
            .replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&')
            .replace(/\n/g, '\n');
    }

    static generarIdUnico() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    static validarNumero(numero) {
        const regex = /^504\d{8}$/;
        return regex.test(numero.replace(/[^0-9]/g, ''));
    }

    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Helpers;