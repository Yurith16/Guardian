const Logger = require('../utils/logger');
const GestorGrupos = require('../database/gestorGrupos');

class ManejadorEventosGrupo {
    constructor() {
        this.gestorGrupos = new GestorGrupos();
    }

    // Procesar variables en el mensaje
    procesarVariables(texto, usuario, grupo, totalMiembros) {
        return texto
            .replace(/@user/g, `@${usuario.split('@')[0]}`)
            .replace(/%group%/g, grupo.subject || 'el grupo')
            .replace(/%membercount%/g, totalMiembros.toString());
    }

    // Obtener foto de perfil del usuario
    async obtenerFotoPerfil(sock, usuario) {
        try {
            const profilePicture = await sock.profilePictureUrl(usuario, 'image');
            return profilePicture;
        } catch (error) {
            return null; // Si no tiene foto de perfil
        }
    }

    // Manejar nuevo miembro
    async manejarNuevoMiembro(sock, jid, usuarios) {
        try {
            const datosGrupo = await this.gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo?.configuraciones?.bienvenidas) return;

            const metadata = await sock.groupMetadata(jid);
            const totalMiembros = metadata.participants.length;

            for (const usuario of usuarios) {
                let mensaje = datosGrupo.configuraciones.welcomeMessage || 
                    `🎉 *BIENVENIDO/A* @user\n` +
                    `¡Bienvenido a *%group%*! 🛡️\n` +
                    `👥 Miembros: %membercount%\n` +
                    `📝 Lee las reglas y disfruta del grupo.`;

                mensaje = this.procesarVariables(mensaje, usuario, metadata, totalMiembros);

                // Intentar obtener foto de perfil
                const fotoPerfil = await this.obtenerFotoPerfil(sock, usuario);

                if (fotoPerfil) {
                    // Enviar con imagen de perfil
                    await sock.sendMessage(jid, {
                        image: { url: fotoPerfil },
                        caption: mensaje,
                        mentions: [usuario]
                    });
                } else {
                    // Enviar solo texto
                    await sock.sendMessage(jid, {
                        text: mensaje,
                        mentions: [usuario]
                    });
                }

                Logger.info(`✅ Bienvenida enviada a ${usuario} en ${jid}`);
            }
        } catch (error) {
            Logger.error('Error en manejarNuevoMiembro:', error);
        }
    }

    // Manejar miembro que sale
    async manejarMiembroSale(sock, jid, usuario) {
        try {
            const datosGrupo = await this.gestorGrupos.obtenerDatos(jid);
            if (!datosGrupo?.configuraciones?.despedidas) return;

            const metadata = await sock.groupMetadata(jid);
            const totalMiembros = metadata.participants.length;

            let mensaje = datosGrupo.configuraciones.byeMessage || 
                `👋 *HASTA PRONTO* @user\n` +
                `Ha abandonado *%group%*\n` +
                `👥 Miembros restantes: %membercount%`;

            mensaje = this.procesarVariables(mensaje, usuario, metadata, totalMiembros);

            // Intentar obtener foto de perfil
            const fotoPerfil = await this.obtenerFotoPerfil(sock, usuario);

            if (fotoPerfil) {
                // Enviar con imagen de perfil
                await sock.sendMessage(jid, {
                    image: { url: fotoPerfil },
                    caption: mensaje,
                    mentions: [usuario]
                });
            } else {
                // Enviar solo texto
                await sock.sendMessage(jid, {
                    text: mensaje,
                    mentions: [usuario]
                });
            }

            Logger.info(`✅ Despedida enviada por ${usuario} en ${jid}`);
        } catch (error) {
            Logger.error('Error en manejarMiembroSale:', error);
        }
    }
}

module.exports = ManejadorEventosGrupo;