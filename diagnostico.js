const fs = require('fs');
const path = require('path');

console.log('🔍 Ejecutando diagnóstico...\n');

// Verificar estructura de carpetas
const carpetas = [
    './plugins',
    './plugins/owner', 
    './plugins/administracion',
    './config',
    './core',
    './utils',
    './sessions'
];

console.log('📁 Verificando carpetas:');
carpetas.forEach(carpeta => {
    const existe = fs.existsSync(carpeta);
    console.log(`${existe ? '✅' : '❌'} ${carpeta}`);
});

// Verificar archivos esenciales
const archivos = [
    './config/bot.json',
    './config/mensajes.json', 
    './core/conexion.js',
    './core/comandos.js',
    './utils/logger.js',
    './main.js',
    './package.json'
];

console.log('\n📄 Verificando archivos:');
archivos.forEach(archivo => {
    const existe = fs.existsSync(archivo);
    console.log(`${existe ? '✅' : '❌'} ${archivo}`);
});

// Verificar plugins
console.log('\n🔌 Verificando plugins:');
try {
    const pluginsOwner = fs.readdirSync('./plugins/owner');
    console.log('✅ plugins/owner:', pluginsOwner);

    const pluginsAdmin = fs.readdirSync('./plugins/administracion');
    console.log('✅ plugins/administracion:', pluginsAdmin);
} catch (error) {
    console.log('❌ Error leyendo plugins:', error.message);
}

console.log('\n🎯 Diagnóstico completado.');