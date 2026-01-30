const AdmZip = require('adm-zip')
const child_process = require('child_process')
const crypto = require('crypto')
const fs = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const os = require('os')
const path = require('path')
const ConfigManager = require('./configmanager')
const { Type, mcVersionAtLeast, getMojangOS } = require('helios-core/common')

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

        const modObj = this.resolveModConfiguration()
        const uberModArr = modObj.fMods.concat(modObj.lMods)

        let rawArgs = this.constructJVMArguments(uberModArr, tempNativePath)

        if (this.usingNeoForge) {
            logger.info('Performing NeoForge 1.21.1 Official Manifest Sync...')

            const mcJarPath = path.join(this.commonDir, 'versions', this.vanillaManifest.id, 'client.jar')
            const neoVersion = '21.1.219'
            const mainClass = 'cpw.mods.bootstraplauncher.BootstrapLauncher'

            // Localiza onde termina os argumentos da JVM e começa a MainClass
            // No Helios/Trinity, a MainClass do ModManifest costuma ser injetada no final do constructJVMArguments
            const modMainClass = String(this.modManifest.mainClass)
            let jvmArgs = rawArgs.filter(arg => arg !== modMainClass)

            // --- BLOCO DE SEGURANÇA JAVA 21 ---
            jvmArgs.push('-Djava.net.preferIPv6Addresses=system')
            jvmArgs.push('-DignoreList=client-extra,client.jar') // Essencial
            jvmArgs.push('-Dproduction=true')
            jvmArgs.push('-Dforceloaderpath=true')

            // Permissões de Módulo para ler o Classpath (Onde mora o Minecraft)
            jvmArgs.push('--add-modules', 'ALL-MODULE-PATH,ALL-SYSTEM')
            jvmArgs.push('--add-opens', 'java.base/java.util.jar=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.lang=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.net=ALL-UNNAMED')
            jvmArgs.push('--add-exports', 'java.base/sun.security.util=ALL-UNNAMED')

            // --- MODULE PATH (-p) ---
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

            // Propriedades do NeoForge para localizar o JAR do jogo
            jvmArgs.push(`-Dbootstraplauncher.gamePath=${mcJarPath}`)
            jvmArgs.push(`-Dfml.minecraftJar=${mcJarPath}`)
            jvmArgs.push(`-Dfml.minecraftVersion=1.21.1`)
            jvmArgs.push(`-Dlaunch.mainClass=net.minecraft.client.main.Main`)

            // Supressão de Splash (Evita o crash da LoadingOverlay em launchers custom)
            jvmArgs.push('-Dfml.earlyDisplay.enabled=false')
            jvmArgs.push('-Dneoforge.earlydisplay=false')
            jvmArgs.push('-Dsplash=false')

            // Argumentos de Jogo (Game Args)
            const gameArgs = [
                '--username', this.authUser.displayName.trim(),
                '--version', `neoforge-${neoVersion}`,
                '--gameDir', this.gameDir,
                '--assetsDir', path.join(this.commonDir, 'assets'),
                '--assetIndex', this.vanillaManifest.assets,
                '--uuid', this.authUser.uuid.trim(),
                '--accessToken', this.authUser.accessToken,
                '--clientId', 'Helios',
                '--xuid', 'N/A',
                '--userType', 'mojang',
                '--versionType', 'release',
                '--fml.neoForgeVersion', neoVersion,
                '--fml.fmlVersion', '4.0.42',
                '--fml.mcVersion', '1.21.1',
                '--fml.neoFormVersion', '20240808.144430',
                '--launchTarget', 'forgeclient'
            ]

            rawArgs = [...jvmArgs, mainClass, ...gameArgs]
        }

        const args = rawArgs.filter(a => a != null && String(a).trim() !== '').map(a => String(a))

        logger.info(`Final sync complete. Running launch chain.`)

        const child = child_process.spawn(ConfigManager.getJavaExecutable(this.server.rawServer.id), args, {
            cwd: this.gameDir,
            detached: ConfigManager.getLaunchDetached()
        })

        if (ConfigManager.getLaunchDetached()) child.unref()

        child.stdout.on('data', (data) => String(data).split('\n').forEach(x => {
            const line = x.trim(); if (line) console.log(`\x1b[32m[Minecraft]\x1b[0m ${line}`)
        }))
        child.stderr.on('data', (data) => String(data).split('\n').forEach(x => {
            const line = x.trim(); if (line) console.log(`\x1b[31m[Minecraft]\x1b[0m ${line}`)
        }))

        return child
    }

    constructJVMArguments(mods, tempNativePath) {
        let rawJvmArgs = (this.vanillaManifest.arguments && this.vanillaManifest.arguments.jvm) ? this.vanillaManifest.arguments.jvm.slice() : []

        // No NeoForge 1.21.1, não concatenamos os JVM args do modManifest aqui 
        // para evitar que as libs entrem no Classpath indevidamente. 
        // Vamos usar apenas os da Vanilla + configurações do Helios.

        let args = this._resolveRules(rawJvmArgs)

        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))

        // Só adiciona a MainClass se não for NeoForge (O NeoForge adiciona a dele no build())
        if (!this.usingNeoForge) {
            args.push(String(this.modManifest.mainClass))
        }

        const cpSeparator = ProcessBuilder.getClasspathSeparator()

        // O segredo: classpathArg() deve conter apenas o Minecraft e libs da Mojang.
        let cp = this.classpathArg().join(cpSeparator)

        return args.map(arg => {
            if (typeof arg !== 'string') return arg
            return arg
                .replaceAll('${auth_player_name}', this.authUser.displayName.trim())
                .replaceAll('${game_directory}', this.gameDir)
                .replaceAll('${assets_root}', path.join(this.commonDir, 'assets'))
                .replaceAll('${assets_index_name}', this.vanillaManifest.assets)
                .replaceAll('${auth_uuid}', this.authUser.uuid.trim())
                .replaceAll('${auth_access_token}', this.authUser.accessToken)
                .replaceAll('${user_type}', 'mojang')
                .replaceAll('${version_type}', 'release')
                .replaceAll('${natives_directory}', tempNativePath || 'natives')
                .replaceAll('${launcher_name}', 'Helios')
                .replaceAll('${launcher_version}', this.launcherVersion || '1.0.0')
                .replaceAll('${library_directory}', this.libPath)
                .replaceAll('${classpath_separator}', cpSeparator)
                .replaceAll('${classpath}', cp)
                .replaceAll('${clientid}', 'Helios')
                .replaceAll('${auth_xuid}', 'N/A')
        })
    }

    _resolveRules(args) {
        const platform = getMojangOS()
        const finalized = []
        for (let arg of args) {
            if (typeof arg === 'string') finalized.push(arg)
            else if (typeof arg === 'object' && arg.rules) {
                let allowed = false
                for (let rule of arg.rules) {
                    if (rule.os) {
                        if (rule.os.name === platform) allowed = (rule.action === 'allow')
                    } else { allowed = (rule.action === 'allow') }
                }
                if (allowed) {
                    if (Array.isArray(arg.value)) finalized.push(...arg.value)
                    else finalized.push(arg.value)
                }
            }
        }
        return finalized
    }

    classpathArg() {
        let cpArgs = []
        const version = this.vanillaManifest.id
        // O JAR do Minecraft (client.jar) DEVE estar no Classpath
        cpArgs.push(path.join(this.commonDir, 'versions', version, 'client.jar'))

        const mojangLibs = this._resolveMojangLibraries()
        cpArgs = cpArgs.concat(Object.values(mojangLibs).map(p => path.normalize(p)))

        return [...new Set(cpArgs)]
    }

    _resolveMojangLibraries() {
        const libs = {}
        for (const lib of this.vanillaManifest.libraries) {
            if (lib.downloads && lib.downloads.artifact) {
                libs[lib.name] = path.join(this.libPath, lib.downloads.artifact.path)
            }
        }
        return libs
    }

    resolveModConfiguration() {
        const fMods = []
        const scan = (mdls) => {
            for (const mdl of mdls) {
                const raw = mdl.rawModule || mdl
                if (raw.type === 'ForgeMod') fMods.push(mdl)
                if (mdl.subModules && mdl.subModules.length > 0) scan(mdl.subModules)
            }
        }
        scan(this.server.modules)
        return { fMods, lMods: [] }
    }

    static getClasspathSeparator() { return process.platform === 'win32' ? ';' : ':' }
}

module.exports = ProcessBuilder;