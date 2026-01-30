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

            const mcJarPath = path.join(this.commonDir, 'versions', this.vanillaManifest.id, this.vanillaManifest.id + '.jar')
            const neoVersion = '21.1.219' // Versão fixa do JSON fornecido pelo usuário

            const mainClass = 'cpw.mods.bootstraplauncher.BootstrapLauncher'
            const mainIndex = rawArgs.indexOf(String(this.modManifest.mainClass))

            let jvmArgs = rawArgs.slice(0, mainIndex)
            let gameArgs = rawArgs.slice(mainIndex + 1)

            const blacklistedGame = ['--launchTarget', '--fml.mcVersion', '--fml.neoForgeVersion', '--fml.fmlVersion', '--fml.neoFormVersion']
            const filteredGame = []
            for (let i = 0; i < gameArgs.length; i++) {
                if (blacklistedGame.includes(gameArgs[i])) { i++; continue }
                filteredGame.push(gameArgs[i])
            }
            gameArgs = filteredGame

            // 1. JVM FLAGS - SUPRESSÃO E IDENTIDADE
            jvmArgs.push('-Djava.net.preferIPv6Addresses=system')
            jvmArgs.push('-DignoreList=client-extra') // Essencial para reconhecer o Minecraft
            jvmArgs.push('-Dneoforge.earlydisplay=false')
            jvmArgs.push('-Dfml.earlyDisplay.enabled=false')
            jvmArgs.push('-Dsplash=false')
            jvmArgs.push('-Dneoforge.main.serviceScan=true')

            // 2. MODULE PATH (-p) - APENAS O NÚCLEO (Conforme JSON oficial + Fix Trinity)
            // Estes são os únicos JARs que o NeoForge exige no Module Path para o boot
            // AVISO: Adicionamos o NeoForm e o Minecraft JAR aqui para garantir visibilidade no boot layer
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

            // REMOVIDO: O Minecraft JAR NUNCA deve ir no Module Path (Erro: Invalid module name '1')
            // Ele será adicionado ao Classpath abaixo.

            jvmArgs.push('-p', moduleJars.join(cpSeparator))
            jvmArgs.push('--add-modules', 'ALL-MODULE-PATH')

            // O NeoForge Universal, Loader e EarlyDisplay devem ficar no CLASSPATH 
            // para que o Splash Screen consiga ler as classes do Minecraft.

            // 3. JPMS - PERMISSÕES E ACESSOS (Conforme JSON oficial)
            jvmArgs.push('--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler')
            jvmArgs.push('--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler')
            jvmArgs.push('--add-opens', 'java.base/java.lang=ALL-UNNAMED')
            jvmArgs.push('--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler')
            jvmArgs.push('--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming')

            // Flags de Suporte Helios e Identificação do Minecraft
            jvmArgs.push(`-Dbootstraplauncher.gamePath=${mcJarPath}`)
            jvmArgs.push(`-Dfml.minecraftJar=${mcJarPath}`)
            jvmArgs.push(`-Dfml.minecraftVersion=1.21.1`) // FORÇA RECONHECIMENTO DA VERSÃO
            jvmArgs.push(`-Dneo.subsystem.libraryDirectory=${this.libPath}`)
            jvmArgs.push(`-Dlaunch.mainClass=net.minecraft.client.main.Main`)
            jvmArgs.push(`-Dminecraft.launcher.brand=Helios`)
            jvmArgs.push(`-Dminecraft.version=1.21.1`)
            jvmArgs.push(`-Dneoforge.version=${neoVersion}`)

            // TOTAL SPLASH SUPPRESSION (Para o NeoForge 1.21)
            jvmArgs.push('-Dfml.earlyDisplay.enabled=false')
            jvmArgs.push('-Dneoforge.earlydisplay=false')
            jvmArgs.push('-Dsplash=false')
            jvmArgs.push('-Dneoforge.main.serviceScan=true')

            // 4. GAME ARGS - Padrão do JSON do NeoForge 1.21.1
            gameArgs.push('--fml.neoForgeVersion', neoVersion)
            gameArgs.push('--fml.fmlVersion', '4.0.42')
            gameArgs.push('--fml.mcVersion', '1.21.1')
            gameArgs.push('--fml.neoFormVersion', '20240808.144430')
            gameArgs.push('--launchTarget', 'forgeclient') // O alvo OFICIAL é forgeclient!

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

        const cpSeparator = ProcessBuilder.getClasspathSeparator()
        let cp = this.classpathArg().join(cpSeparator)
        const neoforgeVersion = '21.1.219'

        // CORREÇÃO: Adicionar TODOS os JARs do JSON do NeoForge ao Classpath
        const neoLibraries = [
            "net/neoforged/fancymodloader/earlydisplay/4.0.42/earlydisplay-4.0.42.jar",
            "net/neoforged/fancymodloader/loader/4.0.42/loader-4.0.42.jar",
            "net/neoforged/accesstransformers/at-modlauncher/10.0.1/at-modlauncher-10.0.1.jar",
            "net/neoforged/accesstransformers/10.0.1/accesstransformers-10.0.1.jar",
            "net/neoforged/bus/8.0.5/bus-8.0.5.jar",
            "net/neoforged/coremods/7.0.3/coremods-7.0.3.jar",
            "cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar",
            "net/neoforged/mergetool/2.0.0/mergetool-2.0.0-api.jar",
            "com/electronwill/night-config/toml/3.8.3/toml-3.8.3.jar",
            "com/electronwill/night-config/core/3.8.3/core-3.8.3.jar",
            "net/neoforged/JarJarSelector/0.4.1/JarJarSelector-0.4.1.jar",
            "net/neoforged/JarJarMetadata/0.4.1/JarJarMetadata-0.4.1.jar",
            "org/apache/maven/maven-artifact/3.8.5/maven-artifact-3.8.5.jar",
            "net/jodah/typetools/0.6.3/typetools-0.6.3.jar",
            "net/minecrell/terminalconsoleappender/1.3.0/terminalconsoleappender-1.3.0.jar",
            "net/fabricmc/sponge-mixin/0.15.2+mixin.0.8.7/sponge-mixin-0.15.2+mixin.0.8.7.jar",
            "org/openjdk/nashorn/nashorn-core/15.4/nashorn-core-15.4.jar",
            "org/apache/commons/commons-lang3/3.14.0/commons-lang3-3.14.0.jar",
            "cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar",
            "cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar",
            "org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar",
            "org/ow2/asm/asm-util/9.8/asm-util-9.8.jar",
            "org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar",
            "org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar",
            "org/ow2/asm/asm/9.8/asm-9.8.jar",
            "net/neoforged/JarJarFileSystems/0.4.1/JarJarFileSystems-0.4.1.jar",
            "net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar",
            "org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar",
            "org/antlr/antlr4-runtime/4.13.1/antlr4-runtime-4.13.1.jar",
            "com/mojang/logging/1.2.7/logging-1.2.7.jar",
            "org/apache/logging/log4j/log4j-slf4j2-impl/2.22.1/log4j-slf4j2-impl-2.22.1.jar",
            "org/apache/logging/log4j/log4j-core/2.22.1/log4j-core-2.22.1.jar",
            "org/apache/logging/log4j/log4j-api/2.22.1/log4j-api-2.22.1.jar",
            "org/jline/jline-reader/3.20.0/jline-reader-3.20.0.jar",
            "org/jline/jline-terminal/3.20.0/jline-terminal-3.20.0.jar",
            "commons-io/commons-io/2.15.1/commons-io-2.15.1.jar",
            "net/minecraftforge/srgutils/0.4.15/srgutils-0.4.15.jar",
            "com/google/guava/guava/32.1.2-jre/guava-32.1.2-jre.jar",
            "com/google/guava/failureaccess/1.0.1/failureaccess-1.0.1.jar",
            "com/google/guava/listenablefuture/9999.0-empty-to-avoid-conflict-with-guava/listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.jar",
            "com/google/code/findbugs/jsr305/3.0.2/jsr305-3.0.2.jar",
            "org/checkerframework/checker-qual/3.33.0/checker-qual-3.33.0.jar",
            "com/google/errorprone/error_prone_annotations/2.18.0/error_prone_annotations-2.18.0.jar",
            "com/google/j2objc/j2objc-annotations/2.8/j2objc-annotations-2.8.jar",
            "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar",
            "org/codehaus/plexus/plexus-utils/3.3.0/plexus-utils-3.3.0.jar",
            "com/machinezoo/noexception/noexception/1.7.1/noexception-1.7.1.jar"
        ].map(p => path.join(this.libPath, p))

        // Adiciona também o JAR universal do NeoForge
        const neoforgeJarName = `neoforge-${neoforgeVersion}-universal.jar`
        const neoforgePath = path.join(this.libPath, 'net', 'neoforged', 'neoforge', neoforgeVersion, neoforgeJarName)
        neoLibraries.push(neoforgePath)

        // CORREÇÃO FINAL: Adicionar o Minecraft JAR explicitamente ao Classpath
        const mcJarPath = path.join(this.commonDir, 'versions', this.vanillaManifest.id, this.vanillaManifest.id + '.jar')
        neoLibraries.push(mcJarPath)

        // CORREÇÃO: Remover duplicatas de todo o Classpath (Evita erro de Duplicate Key / GSON)
        const fullCpArray = cp.split(cpSeparator).concat(neoLibraries)
        const finalCp = [...new Set(fullCpArray.map(p => path.normalize(p).trim()).filter(p => p !== ''))].join(cpSeparator)

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
                .replaceAll('${classpath_separator}', cpSeparator)
                .replaceAll('${classpath}', finalCp) // Classpath limpo e sem duplicadas
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