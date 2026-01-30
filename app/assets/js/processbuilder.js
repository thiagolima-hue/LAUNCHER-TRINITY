const child_process = require('child_process')
const crypto = require('crypto')
const fs = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const os = require('os')
const path = require('path')
const ConfigManager = require('./configmanager')
const { getMojangOS } = require('helios-core/common')

const logger = LoggerUtil.getLogger('ProcessBuilder')

class ProcessBuilder {
    constructor(distroServer, vanillaManifest, modManifest, authUser, launcherVersion) {
        this.server = distroServer
        this.vanillaManifest = vanillaManifest
        this.modManifest = modManifest
        this.authUser = authUser
        this.launcherVersion = launcherVersion
        this.commonDir = ConfigManager.getCommonDirectory()
        this.instanceDir = ConfigManager.getInstanceDirectory()
        this.libPath = path.join(this.commonDir, 'libraries')
        this.gameDir = path.join(this.instanceDir, this.server.rawServer.id)
        this.usingNeoForge = (this.modManifest && this.modManifest.id && this.modManifest.id.includes('neoforge'))
    }

    build() {
        fs.ensureDirSync(this.gameDir)
        const tempNativePath = path.join(os.tmpdir(), ConfigManager.getTempNativeFolder(), crypto.pseudoRandomBytes(16).toString('hex'))
        fs.ensureDirSync(tempNativePath)

        let rawArgs = this.constructJVMArguments(tempNativePath)

        if (this.usingNeoForge) {
            logger.info('Iniciando Boot Modular NeoForge 1.21.1...')
            const mcJarPath = path.join(this.commonDir, 'versions', this.vanillaManifest.id, 'client.jar')
            const mainClass = 'cpw.mods.bootstraplauncher.BootstrapLauncher'

            let jvmArgs = rawArgs.filter(arg => arg !== String(this.modManifest.mainClass))

            // Permissões e Identidade
            jvmArgs.push('-DignoreList=client-extra,client.jar', '-Dproduction=true', '-Dforceloaderpath=true')
            jvmArgs.push('--add-modules', 'ALL-MODULE-PATH,ALL-SYSTEM')

            // Permissões específicas para SecureJarHandler (Java 21)
            jvmArgs.push('--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler')
            jvmArgs.push('--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler')
            jvmArgs.push('--add-opens', 'java.base/java.lang=cpw.mods.securejarhandler')

            // Permissões gerais para o Classpath (ALL-UNNAMED)
            jvmArgs.push('--add-opens', 'java.base/java.util.jar=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.lang=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.net=ALL-UNNAMED')

            jvmArgs.push('--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler')
            jvmArgs.push('--add-exports', 'java.base/sun.security.util=ALL-UNNAMED')
            jvmArgs.push('--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming')

            // Module Path (-p)
            const cpSeparator = ProcessBuilder.getClasspathSeparator()
            const moduleJars = [
                'cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar',
                'cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar',
                'org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar',
                'org/ow2/asm/asm-util/9.8/asm-util-9.8.jar',
                'org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar',
                'org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar',
                'org/ow2/asm/asm/9.8/asm-9.8.jar',
                'net/neoforged/JarJarFileSystems/0.4.1/JarJarFileSystems-0.4.1.jar',
                'net/neoforged/neoform/1.21.1-20240808.144430/neoform-1.21.1-20240808.144430.jar'
            ].map(p => path.join(this.libPath, p))
            jvmArgs.push('-p', moduleJars.join(cpSeparator))

            jvmArgs.push(`-Dbootstraplauncher.gamePath=${mcJarPath}`, `-Dfml.minecraftJar=${mcJarPath}`)
            jvmArgs.push('-Dfml.earlyDisplay.enabled=false', '-Dsplash=false')

            const gameArgs = ['--username', this.authUser.displayName, '--version', '1.21.1', '--gameDir', this.gameDir, '--assetsDir', path.join(this.commonDir, 'assets'), '--assetIndex', this.vanillaManifest.assets, '--uuid', this.authUser.uuid, '--accessToken', this.authUser.accessToken, '--userType', 'mojang', '--fml.mcVersion', '1.21.1', '--fml.neoForgeVersion', '21.1.219', '--launchTarget', 'forgeclient']
            rawArgs = [...jvmArgs, mainClass, ...gameArgs]
        }

        const args = rawArgs.filter(a => a != null && String(a).trim() !== '').map(a => String(a))
        const child = child_process.spawn(ConfigManager.getJavaExecutable(this.server.rawServer.id), args, { cwd: this.gameDir, detached: ConfigManager.getLaunchDetached() })
        if (ConfigManager.getLaunchDetached()) child.unref()

        child.stdout.on('data', (data) => console.log(`[Minecraft] ${data}`))
        child.stderr.on('data', (data) => console.error(`[Minecraft Error] ${data}`))
        return child
    }

    constructJVMArguments(tempNativePath) {
        let args = [
            '-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id),
            '-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id),
            '-Djava.library.path=' + tempNativePath
        ]
        const cpSeparator = ProcessBuilder.getClasspathSeparator()
        const cp = [path.join(this.commonDir, 'versions', this.vanillaManifest.id, 'client.jar'), ...Object.values(this._resolveMojangLibraries())]

        return args.concat([
            '-cp', [...new Set(cp)].join(cpSeparator),
            String(this.modManifest.mainClass)
        ])
    }

    _resolveMojangLibraries() {
        const libs = {}
        this.vanillaManifest.libraries.forEach(lib => {
            if (lib.downloads && lib.downloads.artifact) libs[lib.name] = path.join(this.libPath, lib.downloads.artifact.path)
        })
        return libs
    }

    static getClasspathSeparator() { return process.platform === 'win32' ? ';' : ':' }
}
module.exports = ProcessBuilder