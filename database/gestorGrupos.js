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

            let datosBase = {
                grupo_id: grupoId,
                nombre: grupoInfo?.subject || 'Sin nombre',
                fecha_creacion: new Date().toISOString(),
                fecha_actualizacion: new Date().toISOString(),
                configuraciones: {
                    antilink: true,           // Antilink selectivo
                    antilink2: false,         // Antilink universal (desactivado por defecto)
                    antibots: true,
                    bienvenidas: true,
                    despedidas: false,
                    antispam: true,
                    antimedia: false,
                    antifake: true
                },
                estadisticas: {
                    total_mensajes: 0,
                    total_usuarios: grupoInfo?.participants?.length || 0,
                    ultima_actividad: new Date().toISOString()
                },
                usuarios: {},
                administradores: this.obtenerAdmins(grupoInfo),
                silenciados: {},
                advertencias: {},
                moderacion: {
                    ultima_accion: null,
                    acciones_realizadas: 0
                }
            };

            // Si el archivo existe, cargarlo y actualizar solo lo necesario
            if (fs.existsSync(rutaArchivo)) {
                const datosExistentes = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
                
                // Mantener configuraciones existentes
                if (datosExistentes.configuraciones) {
                    datosBase.configuraciones = {
                        ...datosBase.configuraciones,
                        ...datosExistentes.configuraciones
                    };
                }
                
                // Mantener otros datos existentes
                datosBase = {
                    ...datosBase,
                    ...datosExistentes,
                    fecha_actualizacion: new Date().toISOString()
                };
            }

            await this.guardarDatos(grupoId, datosBase);
            return datosBase;
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

    async guardarDatos(grupoId, datos) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);
            
            // Actualizar fechas
            datos.fecha_actualizacion = new Date().toISOString();
            
            // Asegurar que estadísticas tengan última actividad
            if (datos.estadisticas) {
                datos.estadisticas.ultima_actividad = new Date().toISOString();
            }
            
            fs.writeFileSync(rutaArchivo, JSON.stringify(datos, null, 2), 'utf8');
            return true;
        } catch (error) {
            Logger.error('Error guardando datos del grupo:', error);
            return false;
        }
    }

    async obtenerConfiguracion(grupoId, clave) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.configuraciones) {
                return null;
            }
            
            return datos.configuraciones[clave];
        } catch (error) {
            Logger.error(`Error obteniendo configuración ${clave}:`, error);
            return null;
        }
    }

    async actualizarConfiguracion(grupoId, clave, valor) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }
            
            // Asegurar que exista configuraciones
            if (!datos.configuraciones) {
                datos.configuraciones = {};
            }
            
            // Actualizar configuración
            datos.configuraciones[clave] = valor;
            
            // Registrar acción de moderación
            if (datos.moderacion) {
                datos.moderacion.ultima_accion = {
                    tipo: 'configuracion',
                    clave: clave,
                    valor: valor,
                    fecha: new Date().toISOString()
                };
                datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            }
            
            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error(`Error actualizando configuración ${clave}:`, error);
            return false;
        }
    }

    async obtenerEstadoAntilink2(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.configuraciones) {
                return false; // Por defecto desactivado
            }
            
            return datos.configuraciones.antilink2 === true;
        } catch (error) {
            Logger.error('Error obteniendo estado antilink2:', error);
            return false;
        }
    }

    async actualizarEstadoAntilink2(grupoId, activo) {
        return await this.actualizarConfiguracion(grupoId, 'antilink2', activo);
    }

    // Métodos de silencio (mantenidos)
    async silenciarUsuario(grupoId, usuarioId, duracionMinutos = 5, razon = 'Sin razón específica') {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

            if (!datos.silenciados) {
                datos.silenciados = {};
            }

            const fechaExpiracion = new Date();
            fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + duracionMinutos);

            datos.silenciados[usuarioId] = {
                usuario_id: usuarioId,
                numero: usuarioId.split('@')[0],
                fecha_silenciado: new Date().toISOString(),
                fecha_expiracion: fechaExpiracion.toISOString(),
                duracion_minutos: duracionMinutos,
                razon: razon,
                silenciado_por: null
            };

            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error silenciando usuario:', error);
            return false;
        }
    }

    async quitarSilencio(grupoId, usuarioId) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) return false;

            if (!datos.silenciados || !datos.silenciados[usuarioId]) {
                return false;
            }

            delete datos.silenciados[usuarioId];

            if (Object.keys(datos.silenciados).length === 0) {
                delete datos.silenciados;
            }

            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error quitando silencio:', error);
            return false;
        }
    }

    async verificarSilenciado(grupoId, usuarioId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.silenciados) return { silenciado: false };

            const usuarioSilenciado = datos.silenciados[usuarioId];
            if (!usuarioSilenciado) return { silenciado: false };

            const ahora = new Date();
            const fechaExpiracion = new Date(usuarioSilenciado.fecha_expiracion);

            if (ahora > fechaExpiracion) {
                await this.quitarSilencio(grupoId, usuarioId);
                return { silenciado: false };
            }

            return {
                silenciado: true,
                fecha_expiracion: usuarioSilenciado.fecha_expiracion,
                tiempo_restante: Math.ceil((fechaExpiracion - ahora) / (1000 * 60)),
                duracion: usuarioSilenciado.duracion_minutos,
                razon: usuarioSilenciado.razon,
                fecha_silenciado: usuarioSilenciado.fecha_silenciado,
                silenciado_por: usuarioSilenciado.silenciado_por
            };
        } catch (error) {
            Logger.error('Error verificando silencio:', error);
            return { silenciado: false };
        }
    }

    async obtenerUsuariosSilenciados(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.silenciados) return [];

            const ahora = new Date();
            const usuariosSilenciados = [];

            for (const [usuarioId, info] of Object.entries(datos.silenciados)) {
                const fechaExpiracion = new Date(info.fecha_expiracion);

                if (ahora > fechaExpiracion) {
                    delete datos.silenciados[usuarioId];
                } else {
                    const tiempoRestante = Math.ceil((fechaExpiracion - ahora) / (1000 * 60));
                    usuariosSilenciados.push({
                        usuario_id: usuarioId,
                        numero: info.numero,
                        tiempo_restante: tiempoRestante,
                        duracion: info.duracion_minutos,
                        razon: info.razon,
                        fecha_silenciado: info.fecha_silenciado,
                        silenciado_por: info.silenciado_por
                    });
                }
            }

            if (Object.keys(datos.silenciados).length === 0) {
                delete datos.silenciados;
            }
            await this.guardarDatos(grupoId, datos);

            return usuariosSilenciados;
        } catch (error) {
            Logger.error('Error obteniendo usuarios silenciados:', error);
            return [];
        }
    }

    async actualizarSilenciadoPor(grupoId, usuarioId, adminJid) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.silenciados || !datos.silenciados[usuarioId]) {
                return false;
            }

            datos.silenciados[usuarioId].silenciado_por = adminJid;
            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error actualizando silenciado_por:', error);
            return false;
        }
    }

    // Métodos de archivos (mantenidos)
    async registrarArchivo(grupoId, usuarioId, tipoArchivo) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

            const fechaHoy = new Date().toDateString();

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
                    stickers_diarios: {
                        fecha: fechaHoy,
                        contador: 0
                    }
                };
            }

            const usuario = datos.usuarios[usuarioId];

            if (tipoArchivo === 'sticker') {
                if (usuario.stickers_diarios.fecha !== fechaHoy) {
                    usuario.stickers_diarios.fecha = fechaHoy;
                    usuario.stickers_diarios.contador = 0;
                }

                if (usuario.stickers_diarios.contador >= 10) {
                    return false;
                }

                usuario.stickers_diarios.contador++;
            }

            if (usuario.archivos[tipoArchivo] !== undefined) {
                usuario.archivos[tipoArchivo]++;
                usuario.total_archivos++;
                usuario.ultimo_archivo = new Date().toISOString();

                datos.estadisticas.total_mensajes++;
                datos.estadisticas.ultima_actividad = new Date().toISOString();

                return await this.guardarDatos(grupoId, datos);
            }

            return false;
        } catch (error) {
            Logger.error('Error registrando archivo:', error);
            return false;
        }
    }

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
                configuraciones: datos.configuraciones,
                fecha_creacion: datos.fecha_creacion,
                ultima_actividad: datos.estadisticas.ultima_actividad,
                moderacion: datos.moderacion
            };
        } catch (error) {
            Logger.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    // Método para limpiar grupos antiguos
    async limpiarGruposAntiguos(dias = 30) {
        try {
            const archivos = fs.readdirSync(this.datosPath);
            const ahora = new Date();
            const limite = dias * 24 * 60 * 60 * 1000;
            let eliminados = 0;

            for (const archivo of archivos) {
                if (!archivo.endsWith('.json')) continue;

                const rutaCompleta = path.join(this.datosPath, archivo);
                const datos = JSON.parse(fs.readFileSync(rutaCompleta, 'utf8'));
                
                if (datos.estadisticas?.ultima_actividad) {
                    const ultimaActividad = new Date(datos.estadisticas.ultima_actividad);
                    const diferencia = ahora - ultimaActividad;

                    if (diferencia > limite) {
                        fs.unlinkSync(rutaCompleta);
                        eliminados++;
                        Logger.info(`🧹 Grupo eliminado por inactividad: ${datos.nombre}`);
                    }
                }
            }

            return eliminados;
        } catch (error) {
            Logger.error('Error limpiando grupos antiguos:', error);
            return 0;
        }
    }
}

module.exports = GestorGrupos;