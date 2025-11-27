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
            Logger.info('✅ Carpeta datosgrupos creada');
        }
    }

    // Obtener ruta del archivo JSON del grupo
    obtenerRutaGrupo(grupoId) {
        const nombreArchivo = `${grupoId.replace('@g.us', '')}.json`;
        return path.join(this.datosPath, nombreArchivo);
    }

    // Crear/actualizar datos del grupo
    async inicializarGrupo(grupoId, grupoInfo = null) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);

            // Si el archivo no existe, crearlo
            if (!fs.existsSync(rutaArchivo)) {
                const datosBase = {
                    grupo_id: grupoId,
                    nombre: grupoInfo?.subject || 'Sin nombre',
                    descripcion: grupoInfo?.desc || '',
                    fecha_creacion: new Date().toISOString(),
                    fecha_actualizacion: new Date().toISOString(),
                    configuraciones: {
                        antilink:true,
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
                Logger.info(`📁 Nuevo grupo registrado: ${grupoInfo?.subject || grupoId}`);
            }

            return await this.obtenerDatos(grupoId);
        } catch (error) {
            Logger.error('Error inicializando grupo:', error);
            return null;
        }
    }

    // Obtener lista de administradores
    obtenerAdmins(grupoInfo) {
        if (!grupoInfo?.participants) return [];

        return grupoInfo.participants
            .filter(p => p.admin)
            .map(p => p.id);
    }

    // Obtener datos del grupo
    async obtenerDatos(grupoId) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);

            if (!fs.existsSync(rutaArchivo)) {
                return null;
            }

            const datos = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
            return datos;
        } catch (error) {
            Logger.error('Error obteniendo datos del grupo:', error);
            return null;
        }
    }

    // Guardar datos del grupo
    async guardarDatos(grupoId, datos) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);

            // Actualizar fecha de modificación
            datos.fecha_actualizacion = new Date().toISOString();
            datos.estadisticas.ultima_actividad = new Date().toISOString();

            fs.writeFileSync(rutaArchivo, JSON.stringify(datos, null, 2), 'utf8');
            return true;
        } catch (error) {
            Logger.error('Error guardando datos del grupo:', error);
            return false;
        }
    }

    // Registrar mensaje de usuario
    async registrarMensaje(grupoId, usuarioId, usuarioInfo = null) {
        try {
            let datos = await this.obtenerDatos(grupoId);

            if (!datos) {
                // Si no existe, crear datos básicos
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

            // Inicializar usuario si no existe
            if (!datos.usuarios[usuarioId]) {
                datos.usuarios[usuarioId] = {
                    numero: usuarioId.split('@')[0],
                    mensajes_totales: 0,
                    mensajes_semana: 0,
                    ultimo_mensaje: new Date().toISOString(),
                    primer_mensaje: new Date().toISOString(),
                    es_admin: datos.administradores.includes(usuarioId)
                };
            }

            // Actualizar estadísticas del usuario
            datos.usuarios[usuarioId].mensajes_totales++;
            datos.usuarios[usuarioId].ultimo_mensaje = new Date().toISOString();

            // Actualizar estadísticas del grupo
            datos.estadisticas.total_mensajes++;
            datos.estadisticas.ultima_actividad = new Date().toISOString();

            // Actualizar información del usuario si se proporciona
            if (usuarioInfo) {
                datos.usuarios[usuarioId].es_admin = usuarioInfo.admin || false;
            }

            await this.guardarDatos(grupoId, datos);
            return true;
        } catch (error) {
            Logger.error('Error registrando mensaje:', error);
            return false;
        }
    }

    // Obtener estadísticas del grupo
    async obtenerEstadisticasGrupo(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) return null;

            // Calcular usuario más activo
            const usuariosArray = Object.values(datos.usuarios);
            const usuarioMasActivo = usuariosArray.sort((a, b) => b.mensajes_totales - a.mensajes_totales)[0];

            return {
                grupo_id: datos.grupo_id,
                nombre: datos.nombre,
                total_mensajes: datos.estadisticas.total_mensajes,
                total_usuarios: datos.estadisticas.total_usuarios,
                usuarios_activos: usuariosArray.length,
                usuario_mas_activo: usuarioMasActivo ? {
                    numero: usuarioMasActivo.numero,
                    mensajes: usuarioMasActivo.mensajes_totales
                } : null,
                fecha_creacion: datos.fecha_creacion,
                ultima_actividad: datos.estadisticas.ultima_actividad
            };
        } catch (error) {
            Logger.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    // Obtener ranking de usuarios
    async obtenerRankingUsuarios(grupoId, limite = 10) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) return [];

            const usuariosArray = Object.entries(datos.usuarios)
                .map(([usuarioId, usuario]) => ({
                    usuario_id: usuarioId,
                    numero: usuario.numero,
                    mensajes_totales: usuario.mensajes_totales,
                    es_admin: usuario.es_admin,
                    ultimo_mensaje: usuario.ultimo_mensaje
                }))
                .sort((a, b) => b.mensajes_totales - a.mensajes_totales)
                .slice(0, limite);

            return usuariosArray;
        } catch (error) {
            Logger.error('Error obteniendo ranking:', error);
            return [];
        }
    }

    // Obtener estadísticas de usuario específico
    async obtenerEstadisticasUsuario(grupoId, usuarioId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.usuarios[usuarioId]) {
                return {
                    mensajes_totales: 0,
                    posicion_ranking: 0,
                    es_admin: false
                };
            }

            const usuario = datos.usuarios[usuarioId];
            const ranking = await this.obtenerRankingUsuarios(grupoId, 1000);
            const posicion = ranking.findIndex(u => u.usuario_id === usuarioId) + 1;

            return {
                numero: usuario.numero,
                mensajes_totales: usuario.mensajes_totales,
                posicion_ranking: posicion,
                es_admin: usuario.es_admin,
                primer_mensaje: usuario.primer_mensaje,
                ultimo_mensaje: usuario.ultimo_mensaje,
                total_usuarios: ranking.length
            };
        } catch (error) {
            Logger.error('Error obteniendo stats usuario:', error);
            return null;
        }
    }

    // Actualizar información del grupo
    async actualizarInfoGrupo(grupoId, grupoInfo) {
        try {
            let datos = await this.obtenerDatos(grupoId);

            if (!datos) {
                datos = await this.inicializarGrupo(grupoId, grupoInfo);
            } else {
                datos.nombre = grupoInfo.subject || datos.nombre;
                datos.descripcion = grupoInfo.desc || datos.descripcion;
                datos.estadisticas.total_usuarios = grupoInfo.participants?.length || datos.estadisticas.total_usuarios;
                datos.administradores = this.obtenerAdmins(grupoInfo);

                await this.guardarDatos(grupoId, datos);
            }

            return datos;
        } catch (error) {
            Logger.error('Error actualizando info grupo:', error);
            return null;
        }
    }

    // Listar todos los grupos registrados
    async listarGrupos() {
        try {
            const archivos = fs.readdirSync(this.datosPath)
                .filter(archivo => archivo.endsWith('.json'));

            const grupos = [];

            for (const archivo of archivos) {
                const grupoId = archivo.replace('.json', '') + '@g.us';
                const datos = await this.obtenerDatos(grupoId);
                if (datos) {
                    grupos.push({
                        grupo_id: datos.grupo_id,
                        nombre: datos.nombre,
                        total_mensajes: datos.estadisticas.total_mensajes,
                        total_usuarios: datos.estadisticas.total_usuarios,
                        fecha_creacion: datos.fecha_creacion
                    });
                }
            }

            return grupos;
        } catch (error) {
            Logger.error('Error listando grupos:', error);
            return [];
        }
    }
}

module.exports = GestorGrupos;