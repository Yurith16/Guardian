const Logger = require('./logger');

class AntilinkFilter {
    constructor() {
        // Dominios permitidos
        this.dominiosPermitidos = [
            'youtube.com',
            'youtu.be',
            'instagram.com',
            'tiktok.com',
            'vm.tiktok.com',
            'vt.tiktok.com',
            'twitter.com',
            'x.com',
            'pinterest.com',
            'facebook.com',
            'fb.com',
            'whatsapp.com'
        ];

        Logger.info('✅ Filtro Antilink inicializado');
    }

    // Detectar si un mensaje contiene enlaces no permitidos
    contieneEnlacesNoPermitidos(texto) {
        if (!texto || typeof texto !== 'string') return false;

        // Expresión regular para detectar URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const enlaces = texto.match(urlRegex);

        if (!enlaces) return false;

        for (const enlace of enlaces) {
            try {
                const url = new URL(enlace);
                const dominio = url.hostname.toLowerCase();

                // Verificar si el dominio está en la lista de permitidos
                const esPermitido = this.dominiosPermitidos.some(dominioPermitido => 
                    dominio.includes(dominioPermitido)
                );

                if (!esPermitido) {
                    Logger.info(`🚫 Enlace no permitido detectado: ${dominio}`);
                    return true;
                }
            } catch (error) {
                // Si no es una URL válida, ignorar
                continue;
            }
        }

        return false;
    }

    // Obtener lista de dominios permitidos (para mostrar en mensajes)
    obtenerDominiosPermitidos() {
        return this.dominiosPermitidos;
    }
}

module.exports = AntilinkFilter;