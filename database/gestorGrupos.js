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

    async inicializarGrupo(grupoId, grupoInfo = null) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);
            
            let datosBase = {
                grupo_id: grupoId,
                nombre: grupoInfo?.subject || 'Sin nombre',
                fecha_creacion: new Date().toISOString(),
                fecha_actualizacion: new Date().toISOString(),
                configuraciones: {
                    antilink: true,
                    antilink2: false,
                    antibots: true,
                    bienvenidas: true,
                    despedidas: false,
                    antispam: true,
                    antimedia: false,
                    antifake: true,
                    modo_admin: false
                },
                estadisticas: {
                    total_mensajes: 0,
                    total_usuarios: grupoInfo?.participants?.length || 0,
                    ultima_actividad: new Date().toISOString()
                },
                usuarios: {},
                administradores: [],
                silenciados: {}, 
                advertencias: {},
                moderacion: {
                    ultima_accion: null,
                    acciones_realizadas: 0
                }
            };

            if (grupoInfo?.participants) {
                datosBase.administradores = grupoInfo.participants
                    .filter(p => p.admin)
                    .map(p => p.id);
            }

            fs.writeFileSync(rutaArchivo, JSON.stringify(datosBase, null, 2), 'utf8');
            return datosBase;
        } catch (error) {
            Logger.error('Error inicializando grupo:', error);
            return null;
        }
    }

    async guardarDatos(grupoId, datos) {
        try {
            const rutaArchivo = this.obtenerRutaGrupo(grupoId);
            
            datos.fecha_actualizacion = new Date().toISOString();
            
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

    // ========== MÉTODO ACTUALIZADO PARA CONTAR TODOS LOS MENSAJES ==========
    async registrarMensaje(grupoId, usuarioId, esTexto = true, tipoArchivo = null) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

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
                    mensajes_texto: 0,
                    total_mensajes: 0,
                    ultimo_mensaje: new Date().toISOString(),
                    primer_mensaje: new Date().toISOString(),
                    es_admin: datos.administradores?.includes(usuarioId) || false,
                    stickers_diarios: {
                        fecha: fechaHoy,
                        contador: 0
                    }
                };
            }

            const usuario = datos.usuarios[usuarioId];

            // Actualizar es_admin por si cambió
            if (datos.administradores) {
                usuario.es_admin = datos.administradores.includes(usuarioId);
            }

            if (esTexto) {
                // Es un mensaje de texto
                usuario.mensajes_texto = (usuario.mensajes_texto || 0) + 1;
            } else if (tipoArchivo) {
                // Es un archivo
                if (tipoArchivo === 'sticker') {
                    if (usuario.stickers_diarios.fecha !== fechaHoy) {
                        usuario.stickers_diarios.fecha = fechaHoy;
                        usuario.stickers_diarios.contador = 0;
                    }

                    if (usuario.stickers_diarios.contador < 10) {
                        usuario.stickers_diarios.contador++;
                    } else {
                        // Límite alcanzado, contar como mensaje normal
                        usuario.mensajes_texto = (usuario.mensajes_texto || 0) + 1;
                    }
                }

                if (usuario.archivos[tipoArchivo] !== undefined) {
                    usuario.archivos[tipoArchivo] = (usuario.archivos[tipoArchivo] || 0) + 1;
                    usuario.total_archivos = (usuario.total_archivos || 0) + 1;
                }
            }

            // Calcular total de mensajes
            usuario.total_mensajes = (usuario.mensajes_texto || 0) + (usuario.total_archivos || 0);
            usuario.ultimo_mensaje = new Date().toISOString();

            // Actualizar estadísticas del grupo
            if (!datos.estadisticas) {
                datos.estadisticas = {
                    total_mensajes: 0,
                    total_usuarios: 0,
                    ultima_actividad: new Date().toISOString()
                };
            }

            datos.estadisticas.total_mensajes = (datos.estadisticas.total_mensajes || 0) + 1;
            datos.estadisticas.ultima_actividad = new Date().toISOString();

            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error registrando mensaje:', error);
            return false;
        }
    }

    // Método para compatibilidad con código existente
    async registrarArchivo(grupoId, usuarioId, tipoArchivo) {
        return await this.registrarMensaje(grupoId, usuarioId, false, tipoArchivo);
    }

    // ========== MÉTODOS PARA ACTUALIZACIÓN EN TIEMPO REAL ==========
    async actualizarInfoGrupo(grupoId, groupInfo) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId, groupInfo);
                if (!datos) return false;
            }

            // Actualizar información básica
            datos.nombre = groupInfo.subject || datos.nombre;
            
            // Actualizar administradores
            if (groupInfo.participants) {
                datos.administradores = groupInfo.participants
                    .filter(p => p.admin)
                    .map(p => p.id);

                // Actualizar es_admin en usuarios existentes
                if (datos.usuarios) {
                    for (const usuarioId in datos.usuarios) {
                        datos.usuarios[usuarioId].es_admin = datos.administradores.includes(usuarioId);
                    }
                }
            }

            // Actualizar total de usuarios
            if (datos.estadisticas && groupInfo.participants) {
                datos.estadisticas.total_usuarios = groupInfo.participants.length;
            }

            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error actualizando info grupo:', error);
            return false;
        }
    }

    // Método para obtener todos los usuarios con sus mensajes totales
    async obtenerRankingUsuarios(grupoId, limite = 1000) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos || !datos.usuarios) return [];

            const usuariosArray = Object.entries(datos.usuarios)
                .map(([usuarioId, usuario]) => ({
                    usuario_id: usuarioId,
                    numero: usuario.numero,
                    mensajes_totales: usuario.total_mensajes || usuario.total_archivos || 0,
                    es_admin: usuario.es_admin || false
                }))
                .sort((a, b) => b.mensajes_totales - a.mensajes_totales)
                .slice(0, limite);

            return usuariosArray;
        } catch (error) {
            Logger.error('Error obteniendo ranking de usuarios:', error);
            return [];
        }
    }

    // ========== MÉTODOS MODO ADMIN ==========
    async obtenerModoAdmin(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                const nuevoGrupo = await this.inicializarGrupo(grupoId);
                return nuevoGrupo ? nuevoGrupo.configuraciones.modo_admin === true : false;
            }
            
            if (!datos.configuraciones) {
                datos.configuraciones = { modo_admin: false };
                await this.guardarDatos(grupoId, datos);
            }
            
            return datos.configuraciones.modo_admin === true;
        } catch (error) {
            Logger.error('Error obteniendo modo admin:', error);
            return false;
        }
    }

    async activarModoAdmin(grupoId) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }
            
            if (!datos.configuraciones) {
                datos.configuraciones = {};
            }
            
            datos.configuraciones.modo_admin = true;
            
            if (!datos.moderacion) {
                datos.moderacion = {};
            }
            
            datos.moderacion.ultima_accion = {
                tipo: 'activar_modo_admin',
                fecha: new Date().toISOString()
            };
            datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            
            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error activando modo admin:', error);
            return false;
        }
    }

    async desactivarModoAdmin(grupoId) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }
            
            if (!datos.configuraciones) {
                datos.configuraciones = {};
            }
            
            datos.configuraciones.modo_admin = false;
            
            if (!datos.moderacion) {
                datos.moderacion = {};
            }
            
            datos.moderacion.ultima_accion = {
                tipo: 'desactivar_modo_admin',
                fecha: new Date().toISOString()
            };
            datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            
            return await this.guardarDatos(grupoId, datos);
        } catch (error) {
            Logger.error('Error desactivando modo admin:', error);
            return false;
        }
    }

    // ========== MÉTODOS PARA SISTEMA DE MUTE ==========
    async silenciarUsuario(grupoId, usuarioId, duracionMinutos = 5, razon = 'Sin razón específica', silenciadoPor = null) {
        try {
            let datos = await this.obtenerDatos(grupoId);
            if (!datos) {
                datos = await this.inicializarGrupo(grupoId);
                if (!datos) return false;
            }

            // Inicializar silenciados si no existe
            if (!datos.silenciados) {
                datos.silenciados = {};
            }

            // Calcular fecha de expiración
            const fechaExpiracion = new Date();
            fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + duracionMinutos);

            // Agregar usuario a silenciados
            datos.silenciados[usuarioId] = {
                usuario_id: usuarioId,
                numero: usuarioId.split('@')[0],
                fecha_silenciado: new Date().toISOString(),
                fecha_expiracion: fechaExpiracion.toISOString(),
                duracion_minutos: duracionMinutos,
                razon: razon,
                silenciado_por: silenciadoPor
            };

            // Registrar acción en moderación
            if (datos.moderacion) {
                datos.moderacion.ultima_accion = {
                    tipo: 'silenciar_usuario',
                    usuario: usuarioId,
                    duracion: duracionMinutos,
                    fecha: new Date().toISOString()
                };
                datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            }

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

            // Registrar acción en moderación
            if (datos.moderacion) {
                datos.moderacion.ultima_accion = {
                    tipo: 'quitar_silencio',
                    usuario: usuarioId,
                    fecha: new Date().toISOString()
                };
                datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            }

            // Eliminar usuario de silenciados
            delete datos.silenciados[usuarioId];

            // Si no hay más usuarios silenciados, eliminar el objeto
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
            if (!datos || !datos.silenciados) {
                return { 
                    silenciado: false, 
                    razon: 'no_silenciado_o_no_datos' 
                };
            }

            const usuarioSilenciado = datos.silenciados[usuarioId];
            if (!usuarioSilenciado) {
                return { 
                    silenciado: false, 
                    razon: 'usuario_no_silenciado' 
                };
            }

            // Verificar si el silencio ha expirado
            const ahora = new Date();
            const fechaExpiracion = new Date(usuarioSilenciado.fecha_expiracion);

            if (ahora > fechaExpiracion) {
                // Eliminar automáticamente si ha expirado
                await this.quitarSilencio(grupoId, usuarioId);
                return { 
                    silenciado: false, 
                    razon: 'expirado_automaticamente' 
                };
            }

            return {
                silenciado: true,
                usuario_id: usuarioId,
                numero: usuarioSilenciado.numero,
                fecha_expiracion: usuarioSilenciado.fecha_expiracion,
                tiempo_restante: Math.ceil((fechaExpiracion - ahora) / (1000 * 60)),
                duracion: usuarioSilenciado.duracion_minutos,
                razon: usuarioSilenciado.razon,
                fecha_silenciado: usuarioSilenciado.fecha_silenciado,
                silenciado_por: usuarioSilenciado.silenciado_por,
                razon_silenciado: 'usuario_silenciado_activo'
            };
        } catch (error) {
            Logger.error('Error verificando silencio:', error);
            return { 
                silenciado: false, 
                razon: 'error_verificacion' 
            };
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
                    await this.quitarSilencio(grupoId, usuarioId);
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

            return usuariosSilenciados;
        } catch (error) {
            Logger.error('Error obteniendo usuarios silenciados:', error);
            return [];
        }
    }

    // ========== MÉTODOS PARA OBTENER DATOS ==========
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
                total_archivos: usuario.total_archivos || 0,
                mensajes_texto: usuario.mensajes_texto || 0,
                total_mensajes: usuario.total_mensajes || 0,
                stickers_hoy: stickersHoy,
                stickers_restantes: Math.max(0, 10 - stickersHoy),
                ultimo_mensaje: usuario.ultimo_mensaje || usuario.ultimo_archivo,
                primer_mensaje: usuario.primer_mensaje || usuario.primer_archivo,
                es_admin: usuario.es_admin || false
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
                    total_mensajes: usuario.total_mensajes || usuario.total_archivos || 0,
                    archivos: usuario.archivos,
                    ultimo_mensaje: usuario.ultimo_mensaje || usuario.ultimo_archivo,
                    es_admin: usuario.es_admin || false
                }))
                .sort((a, b) => b.total_mensajes - a.total_mensajes)
                .slice(0, limite);

            return usuariosArray;
        } catch (error) {
            Logger.error('Error obteniendo top activos:', error);
            return [];
        }
    }

    // ========== MÉTODOS GENERALES ==========
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
            
            if (!datos.configuraciones) {
                datos.configuraciones = {};
            }
            
            datos.configuraciones[clave] = valor;
            
            if (!datos.moderacion) {
                datos.moderacion = {};
            }
            
            datos.moderacion.ultima_accion = {
                tipo: 'configuracion',
                clave: clave,
                valor: valor,
                fecha: new Date().toISOString()
            };
            datos.moderacion.acciones_realizadas = (datos.moderacion.acciones_realizadas || 0) + 1;
            
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
                return false;
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

    async obtenerEstadisticasGrupo(grupoId) {
        try {
            const datos = await this.obtenerDatos(grupoId);
            if (!datos) return null;

            const usuariosArray = Object.values(datos.usuarios);
            const usuarioMasActivo = usuariosArray.sort((a, b) => 
                (b.total_mensajes || 0) - (a.total_mensajes || 0)
            )[0];

            return {
                grupo_id: datos.grupo_id,
                nombre: datos.nombre,
                total_mensajes: datos.estadisticas.total_mensajes || 0,
                total_usuarios: datos.estadisticas.total_usuarios || 0,
                usuarios_activos: usuariosArray.length,
                usuario_mas_activo: usuarioMasActivo ? {
                    numero: usuarioMasActivo.numero,
                    mensajes: usuarioMasActivo.total_mensajes || 0
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
}

module.exports = GestorGrupos;