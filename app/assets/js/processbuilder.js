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
            logger.info('Performing NeoForge 1.21.1 Deep System Link...')

            const mcJarPath = path.join(this.commonDir, 'versions', this.vanillaManifest.id, this.vanillaManifest.id + '.jar')
            const neoVersion = this.modManifest.id.split(':').pop().replace('neoforge-', '')

            const mainClass = String(this.modManifest.mainClass)
            const mainIndex = rawArgs.indexOf(mainClass)

            let jvmArgs = rawArgs.slice(0, mainIndex)
            let gameArgs = rawArgs.slice(mainIndex + 1)

            const blacklistedGame = ['--launchTarget', '--fml.mcVersion', '--fml.neoForgeVersion', '--fml.fmlVersion']
            const filteredGame = []
            for (let i = 0; i < gameArgs.length; i++) {
                if (blacklistedGame.includes(gameArgs[i])) { i++; continue }
                filteredGame.push(gameArgs[i])
            }
            gameArgs = filteredGame

            // JVM FLAGS (Resolução de Ambiente Customizado)
            jvmArgs.push('--add-reads', 'java.base=ALL-UNNAMED')
            jvmArgs.push('--add-reads', 'cpw.mods.securejarhandler=ALL-UNNAMED')
            jvmArgs.push('--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler')

            // Força o escaneamento de serviços (Resolve o Missing Launch Handler)
            jvmArgs.push('-Dneoforge.main.serviceScan=true')

            jvmArgs.unshift(`-DignoreList=client-extra`)
            jvmArgs.unshift(`-Dbootstraplauncher.gamePath=${mcJarPath}`)
            jvmArgs.unshift(`-Dfml.minecraftJar=${mcJarPath}`)
            jvmArgs.unshift(`-Dneo.subsystem.libraryDirectory=${this.libPath}`)
            jvmArgs.unshift(`-Dlaunch.mainClass=net.minecraft.client.main.Main`)
            jvmArgs.unshift(`-Dminecraft.launcher.brand=Helios`)
            jvmArgs.unshift(`-Dminecraft.version=1.21.1`)
            jvmArgs.unshift(`-Dneoforge.version=${neoVersion}`)

            // GAME ARGS 
            gameArgs.push('--fml.neoForgeVersion', neoVersion)
            gameArgs.push('--fml.fmlVersion', '4.0.42')
            gameArgs.push('--fml.mcVersion', '1.21.1')
            gameArgs.push('--launchTarget', 'forgeclient') // Revertido para o alvo padrão estável

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
        if (this.modManifest.arguments && this.modManifest.arguments.jvm) {
            rawJvmArgs = rawJvmArgs.concat(this.modManifest.arguments.jvm)
        }

        let args = this._resolveRules(rawJvmArgs)

        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))
        args.push(String(this.modManifest.mainClass))

        let rawGameArgs = this.vanillaManifest.arguments.game ? this.vanillaManifest.arguments.game.concat(this.modManifest.arguments.game || []) : []
        args = args.concat(this._resolveRules(rawGameArgs))

        const cp = this.classpathArg().join(ProcessBuilder.getClasspathSeparator())
        const neoforgeVersion = this.modManifest.id.split(':').pop()
        const ignoreName = `neoforge-${neoforgeVersion}-universal`

        return args.map(arg => {
            if (typeof arg !== 'string') return arg
            return arg
                .replaceAll('${auth_player_name}', this.authUser.displayName.trim())
                .replaceAll('${version_name}', ignoreName)
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
                .replaceAll('${classpath_separator}', ProcessBuilder.getClasspathSeparator())
                .replaceAll('${classpath}', cp)
                .replaceAll('${clientid}', 'Helios')
                .replaceAll('${auth_xuid}', 'N/A')
                .replaceAll('${resolution_width}', '928')
                .replaceAll('${resolution_height}', '522')
                .replaceAll('${quickPlayPath}', 'null')
                .replaceAll('${quickPlaySingleplayer}', 'null')
                .replaceAll('${quickPlayMultiplayer}', 'null')
                .replaceAll('${quickPlayRealms}', 'null')
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
        cpArgs.push(path.join(this.commonDir, 'versions', version, version + '.jar'))
        const mojangLibs = this._resolveMojangLibraries()
        const allLibs = this._resolveAllServerLibrariesRecursively(this.server.modules)
        const finalLibs = { ...mojangLibs, ...allLibs }
        cpArgs = cpArgs.concat(Object.values(finalLibs).map(p => path.normalize(p)))
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

    _resolveAllServerLibrariesRecursively(modules) {
        const libs = {}
        const scan = (mdls) => {
            for (const mdl of mdls) {
                const raw = mdl.rawModule || mdl
                if (raw.type === 'Library' || raw.type === 'ForgeHosted' || raw.type === 'Forge') {
                    if (raw.artifact && raw.artifact.path) {
                        libs[raw.id] = path.join(this.libPath, raw.artifact.path)
                    }
                }
                if (mdl.subModules && mdl.subModules.length > 0) scan(mdl.subModules)
            }
        }
        scan(modules)
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
    setupLiteLoader() { this.usingLiteLoader = false }
}

module.exports = ProcessBuilder