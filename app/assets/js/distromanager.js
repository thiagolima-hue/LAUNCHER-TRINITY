const fs = require('fs-extra')
const path = require('path')
const ConfigManager = require('./configmanager')
const { HeliosDistribution } = require('helios-core/common')

const log = (msg) => console.log(`[DistroManager] ${msg}`)

class DistroManager {
    constructor() { }

    async getDistribution() {
        const LOCAL_DISTRO_PATH = path.join(__dirname, '..', 'distribution.json')
        const APPDATA_DISTRO_PATH = path.join(ConfigManager.getLauncherDirectory(), 'distribution.json')

        if (!ConfigManager.isLoaded?.() && ConfigManager.load) { ConfigManager.load() }

        const commonDir = ConfigManager.getCommonDirectory()
        const instanceDir = ConfigManager.getInstanceDirectory()

        let distroJson = fs.readJsonSync(LOCAL_DISTRO_PATH)
        const serverId = distroJson.servers[0].id

        // --- SEEDING OFFLINE ---
        if (process.env.OFFLINE_MODE === 'true') {
            log("Offline Mode: Seeding version manifest and mods...")

            // 1. Seed Version Manifest (CRITICAL for "No mod loader version manifest")
            const versionJsonSource = path.join(__dirname, '..', '..', '..', 'builder_info', 'version.json')
            if (fs.existsSync(versionJsonSource)) {
                const versionData = fs.readJsonSync(versionJsonSource)
                const manifestId = versionData.id // e.g., neoforge-21.1.219
                const manifestTarget = path.join(commonDir, 'versions', manifestId, `${manifestId}.json`)

                fs.ensureDirSync(path.dirname(manifestTarget))
                fs.copySync(versionJsonSource, manifestTarget, { overwrite: true })
                log(`Seeded manifest to: ${manifestTarget}`)
            }

            // 2. Seed Mods
            const modsDir = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'mods')
            if (fs.existsSync(modsDir)) {
                const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'))
                for (const file of files) {
                    const targetPath = path.join(instanceDir, serverId, 'mods', file)
                    fs.ensureDirSync(path.dirname(targetPath))
                    fs.copySync(path.join(modsDir, file), targetPath)
                }
            }

            fs.writeJsonSync(APPDATA_DISTRO_PATH, distroJson, { spaces: 2 })
        }

        return new HeliosDistribution(distroJson, commonDir, instanceDir)
    }

    async refreshDistribution() { return this.getDistribution() }
    async refreshDistributionOrFallback() { return this.getDistribution() }
    isDevMode() { return false }
}

const DistroAPI = new DistroManager()
exports.DistroAPI = DistroAPI
exports.pullDistribution = () => DistroAPI.getDistribution()