const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class GestorGrupos {
    constructor() {
        this.datosPath = path.join(__dirname, 'datosgrupos');
        this.crearCarpetaDatos();
    }

    crearCarpetaDatos() {
        if (!fs.existsSync(this.datosPath)) {
            fs.mkdirSync(this.datosPath, { recursive: true });
        }
    }

    obtenerRutaGrupo(grupoId) {
        const nombreArchivo = `${grupoId.replace('@g.us', '')}.json`;
        return path.join(this.datosPath, nombreArchivo);
    }

    async inicializarGrupo(grupoId, grupoInfo = null) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);

            if (!fs.existsSync(rutaArchivo)) {
                const datosBase = {
                    grupo_id: grupoId,
                    nombre: grupoInfo?.subject || 'Sin nombre',
                    fecha_creacion: new Date().toISOString(),
                    fecha_actualizacion: new Date().toISOString(),
                    configuraciones: {
                        antilink: true,
                        antibots: true,
                        bienvenidas: true,
                        despedidas: false
                    },
                    estadisticas: {
                        total_mensajes: 0,
                        total_usuarios: grupoInfo?.participants?.length || 0,
                        ultima_actividad: new Date().toISOString()
                    },
                    usuarios: {},
                    administradores: this.obtenerAdmins(grupoInfo)
                };

                await this.guardarDatos(grupoId, datosBase);
            }

            return await this.obtenerDatos(grupoId);
        } catch (error) {
            Logger.error('Error inicializando grupo:', error);
            return null;
        }
    }

    obtenerAdmins(grupoInfo) {
        if (!grupoInfo?.participants) return [];
        return grupoInfo.participants
            .filter(p => p.admin)
            .map(p => p.id);
    }

    async obtenerDatos(grupoId) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);
            if (!fs.existsSync(rutaArchivo)) return null;
            return JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
        } catch (error) {
            Logger.error('Error obteniendo datos del grupo:', error);
            return null;
        }
    }

    async guardarDatos(grupoId, datos) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);
            datos.fecha_actualizacion = new Date().toISOString();
            datos.estadisticas.ultima_actividad = new Date().toISOString();
            fs.writeFileSync(rutaArchivo, JSON.stringify(datos, null, 2), 'utf8');
            return true;
        } catch (error) {
            Logger.error('Error guardando datos del grupo:', error);
            return false;
        }
    }

    // ✅ NUEVO: Registrar archivo de usuario
    async registrarArchivo(grupoId, usuarioId, tipoArchivo) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

            // Obtener fecha actual para control de stickers
            const fechaHoy = new Date().toDateString();

            // Inicializar usuario si no existe
            if (!datos.usuarios[usuarioId]) {
                datos.usuarios[usuarioId] = {
                    numero: usuarioId.split('@')[0],
                    archivos: {
                        imagenes: 0,
                        videos: 0,
                        audios: 0,
                        documentos: 0,
                        stickers: 0,
                        otros: 0
                    },
                    total_archivos: 0,
                    ultimo_archivo: new Date().toISOString(),
                    primer_archivo: new Date().toISOString(),
                    es_admin: datos.administradores.includes(usuarioId),
                    // Control de stickers diarios
                    stickers_diarios: {
                        fecha: fechaHoy,
                        contador: 0
                    }
                };
            }

            const usuario = datos.usuarios[usuarioId];

            // ✅ CONTROL DE STICKERS (máximo 10 por día)
            if (tipoArchivo === 'sticker') {
                // Verificar si es nuevo día
                if (usuario.stickers_diarios.fecha !== fechaHoy) {
                    usuario.stickers_diarios.fecha = fechaHoy;
                    usuario.stickers_diarios.contador = 0;
                }

                // Si ya alcanzó el límite, ignorar
                if (usuario.stickers_diarios.contador >= 10) {
                    return false;
                }

                // Incrementar contador de stickers
                usuario.stickers_diarios.contador++;
            }

            // Incrementar contador del tipo de archivo
            if (usuario.archivos[tipoArchivo] !== undefined) {
                usuario.archivos[tipoArchivo]++;
                usuario.total_archivos++;
                usuario.ultimo_archivo = new Date().toISOString();

                // Actualizar estadísticas del grupo
                datos.estadisticas.total_mensajes++;
                datos.estadisticas.ultima_actividad = new Date().toISOString();

                await this.guardarDatos(grupoId, datos);
                return true;
            }

            return false;
        } catch (error) {
            Logger.error('Error registrando archivo:', error);
            return false;
        }
    }

    // ✅ NUEVO: Obtener perfil de usuario
    async obtenerPerfilUsuario(grupoId, usuarioId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.usuarios[usuarioId]) {
                return null;
            }

            const usuario = datos.usuarios[usuarioId];
            const fechaHoy = new Date().toDateString();
            const stickersHoy = usuario.stickers_diarios.fecha === fechaHoy ? usuario.stickers_diarios.contador : 0;

            return {
                numero: usuario.numero,
                archivos: usuario.archivos,
                total_archivos: usuario.total_archivos,
                stickers_hoy: stickersHoy,
                stickers_restantes: Math.max(0, 10 - stickersHoy),
                ultimo_archivo: usuario.ultimo_archivo,
                primer_archivo: usuario.primer_archivo,
                es_admin: usuario.es_admin
            };
        } catch (error) {
            Logger.error('Error obteniendo perfil usuario:', error);
            return null;
        }
    }

    // ✅ NUEVO: Obtener top de usuarios activos
    async obtenerTopActivos(grupoId, limite = 20) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) return [];

            const usuariosArray = Object.entries(datos.usuarios)
                .map(([usuarioId, usuario]) => ({
                    usuario_id: usuarioId,
                    numero: usuario.numero,
                    total_archivos: usuario.total_archivos,
                    archivos: usuario.archivos,
                    ultimo_archivo: usuario.ultimo_archivo,
                    es_admin: usuario.es_admin
                }))
                .sort((a, b) => b.total_archivos - a.total_archivos)
                .slice(0, limite);

            return usuariosArray;
        } catch (error) {
            Logger.error('Error obteniendo top activos:', error);
            return [];
        }
    }

    // Mantener métodos existentes para compatibilidad
    async registrarMensaje(grupoId, usuarioId, usuarioInfo = null) {
        // Método mantenido para compatibilidad
        return true;
    }

    async obtenerEstadisticasGrupo(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) return null;

            const usuariosArray = Object.values(datos.usuarios);
            const usuarioMasActivo = usuariosArray.sort((a, b) => b.total_archivos - a.total_archivos)[0];

            return {
                grupo_id: datos.grupo_id,
                nombre: datos.nombre,
                total_mensajes: datos.estadisticas.total_mensajes,
                total_usuarios: datos.estadisticas.total_usuarios,
                usuarios_activos: usuariosArray.length,
                usuario_mas_activo: usuarioMasActivo ? {
                    numero: usuarioMasActivo.numero,
                    archivos: usuarioMasActivo.total_archivos
                } : null,
                fecha_creacion: datos.fecha_creacion,
                ultima_actividad: datos.estadisticas.ultima_actividad
            };
        } catch (error) {
            Logger.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }
}

module.exports = GestorGrupos;