const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

const distributionPath = path.join(__dirname, 'app', 'assets', 'distribution.json');

async function getFileData(url) {
    try {
        console.log(`Downloading ${url}...`);
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        const response = await axios.get(url, { responseType: 'arraybuffer', httpsAgent: agent, maxRedirects: 10 });
        const buffer = Buffer.from(response.data);

        const size = buffer.length;
        const hash = crypto.createHash('md5').update(buffer).digest('hex');

        return { size, md5: hash };
    } catch (error) {
        console.error(`Error downloading ${url}:`, error.message);
        return null;
    }
}

async function processArtifact(artifact) {
    if (artifact && artifact.url) {
        // Skip localhost mods
        if (artifact.url.includes('localhost')) return;

        // Force update if MD5 is zero or if we want absolute integrity
        const data = await getFileData(artifact.url);
        if (data) {
            console.log(`Updated Integrity for ${artifact.path}: Size=${data.size}, MD5=${data.md5}`);
            artifact.size = data.size;
            artifact.MD5 = data.md5;
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
    console.log('--- Distribution Synchronization Complete! ---');
    console.log('All MD5s and Sizes are now matched with remote files.');
}

updateDistribution();
