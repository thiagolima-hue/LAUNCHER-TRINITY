const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

const distributionPath = path.join(__dirname, 'app', 'assets', 'distribution.json');

async function calculateMD5(url) {
    try {
        console.log(`Downloading ${url}...`);
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        const response = await axios.get(url, { responseType: 'arraybuffer', httpsAgent: agent });
        const buffer = Buffer.from(response.data, 'binary');
        const hash = crypto.createHash('md5');
        hash.update(buffer);
        return hash.digest('hex');
    } catch (error) {
        console.error(`Error downloading ${url}:`, error.message);
        return null;
    }
}

async function processArtifact(artifact) {
    if (artifact && artifact.url && artifact.MD5 === '00000000000000000000000000000000') {
        // Skip localhost mods
        if (artifact.url.includes('localhost')) return;

        const md5 = await calculateMD5(artifact.url);
        if (md5) {
            console.log(`Updated MD5 for ${artifact.path}: ${md5}`);
            artifact.MD5 = md5;
            // Also update size if needed, but we used size from version.json which is correct.
        }
    }
}

async function updateDistribution() {
    if (!fs.existsSync(distributionPath)) {
        console.error('distribution.json not found');
        return;
    }

    const distro = JSON.parse(fs.readFileSync(distributionPath, 'utf8'));

    for (const server of distro.servers) {
        for (const module of server.modules) {
            await processArtifact(module.artifact);
            if (module.subModules) {
                for (const sub of module.subModules) {
                    await processArtifact(sub.artifact);
                }
            }
        }
    }

    fs.writeFileSync(distributionPath, JSON.stringify(distro, null, 2));
    console.log('Distribution updated with real MD5s.');
}

updateDistribution();
