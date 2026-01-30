const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')

// Configurações
const APPDATA = process.env.APPDATA
const BASE_DIR = path.join(APPDATA, '.HumblePixelmon')
const COMMON_DIR = path.join(BASE_DIR, 'common')
const LIB_DIR = path.join(COMMON_DIR, 'libraries')
const VERSIONS_DIR = path.join(COMMON_DIR, 'versions')

function getMD5(file) {
    if (!fs.existsSync(file)) return null
    const buffer = fs.readFileSync(file)
    return crypto.createHash('md5').update(buffer).digest('hex')
}

console.log('--- Trinity Launcher Seeder ---')

// 1. Garantir que o manifesto do NeoForge exista onde o Helios espera
// O Helios espera em: common/neoforge-21.1.219.json (conforme definido no distribution.json path)
const targetManifest = path.join(COMMON_DIR, 'neoforge-21.1.219.json')

if (!fs.existsSync(targetManifest)) {
    console.warn('⚠️  Manifesto do NeoForge não encontrado!')
    console.log(`Por favor, coloque o arquivo neoforge-21.1.219.json em: ${targetManifest}`)
} else {
    console.log('✅ Manifesto do NeoForge detectado.')
}

// 2. Escanear Mods
const modsDir = path.join(BASE_DIR, 'instances', 'trinity-pixelmon', 'mods')
if (fs.existsSync(modsDir)) {
    const mods = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'))
    console.log(`✅ Detectados ${mods.length} mods locais.`)

    // Aqui poderíamos atualizar o distribution.json com os hashes reais, 
    // mas o erro ENOTFOUND é antes da validação de hash.
}

console.log('\n--- Diagnóstico de Rede ---')
console.log('O erro ENOTFOUND distro.trinity.com indica que este domínio não existe.')
console.log('Para corrigir sem um servidor online:')
console.log('1. Abra o arquivo: C:\\Windows\\System32\\drivers\\etc\\hosts (como Administrador)')
console.log('2. Adicione a linha: 127.0.0.1 distro.trinity.com')
console.log('3. Isso fará o launcher procurar os arquivos no seu próprio PC.')
console.log('4. Se você tiver um servidor local (WAMP, XAMPP, etc), coloque os arquivos lá.')

console.log('\n--- Recomendação ---')
console.log('Se você quer que o Helios pule o download, precisamos trocar o AssetGuard para modo offline.')
