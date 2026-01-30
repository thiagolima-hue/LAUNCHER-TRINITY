const { ipcRenderer } = require('electron')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')

const ConfigManager = require('./configmanager')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Initialize Config
try {
    ConfigManager.load()
} catch (e) {
    logger.error('Failed to load config, using defaults.', e)
}

// Now require these
const { DistroAPI } = require('./distromanager')
const LangLoader = require('./langloader')

// Compatibility bridge
if (DistroAPI) {
    try {
        DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
        DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()
    } catch (e) {
        logger.warn('Failed to set DistroAPI directories, they will be resolved lazily.')
    }
}

// Load Strings
LangLoader.setupLanguage()

/**
 * 
 * @param {HeliosDistribution} data 
 */
function onDistroLoad(data) {
    if (data != null) {
        try {
            // Resolve the selected server if its value has yet to be set.
            if (ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null) {
                logger.info('Determining default selected server..')
                ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
                ConfigManager.save()
            }
        } catch (e) {
            logger.error('Error during onDistroLoad server selection:', e)
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

// Ensure Distribution is downloaded and cached.
if (DistroAPI && DistroAPI.getDistribution) {
    DistroAPI.getDistribution()
        .then(heliosDistro => {
            logger.info('Loaded distribution index.')
            onDistroLoad(heliosDistro)
        })
        .catch(err => {
            logger.info('Failed to load an older version of the distribution index.')
            logger.info('Application cannot run.')
            logger.error(err)
            onDistroLoad(null)
        })
} else {
    logger.error('DistroAPI not found! Fatal error.')
    onDistroLoad(null)
}

// Clean up temp dir
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if (err) {
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})