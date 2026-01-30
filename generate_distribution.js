const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function generate() {
    console.log('Generating NeoForge 1.21.1 Distribution + REQUIRED VersionManifest...');

    const versionJsonPath = path.join(__dirname, '..', '..', 'builder_info', 'version.json');
    const modsDir = path.join(__dirname, '..', '..', 'mods');
    const outputFile = path.join(__dirname, 'app', 'assets', 'distribution.json');

    if (!fs.existsSync(versionJsonPath)) {
        console.error('CRITICAL: version.json not found at ' + versionJsonPath);
        return;
    }

    const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const neoforgeVersion = versionData.id.replace('neoforge-', '');
    const manifestId = `neoforge-${neoforgeVersion}`;

    const server = {
        id: "trinity-pixelmon",
        name: "TRINITY PIXELMON",
        description: "NeoForge 1.21.1 Pure Migration",
        icon: "https://i.imgur.com/pzcZJxC.png",
        version: "1.3.0",
        address: "enx-cirion-93.enx.host:10005",
        host: "enx-cirion-93.enx.host",
        hostname: "enx-cirion-93.enx.host",
        port: 10005,
        minecraftVersion: "1.21.1",
        mainServer: true,
        autoconnect: false,
        javaOptions: { suggestedMajor: 21, supported: ">=21", jvmArgs: ["-Dforceloaderpath=true"] },
        modules: []
    };

    // 1. NeoForge Main Module
    const neoforgeModule = {
        id: `net.neoforged:neoforge:${neoforgeVersion}`,
        name: `NeoForge ${neoforgeVersion}`,
        type: "ForgeHosted",
        required: { value: true, def: true },
        artifact: {
            size: 3524551,
            MD5: "f7a703bed50fb3cf2e6926a38ec85aa4",
            url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-universal.jar`,
            path: `net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-universal.jar`
        },
        subModules: []
    };

    // 2. OBRIGATÓRIO: VersionManifest (Resolve o erro "No mod loader version manifest")
    neoforgeModule.subModules.push({
        id: manifestId,
        name: `NeoForge ${neoforgeVersion} Manifest`,
        type: "VersionManifest",
        required: { value: true, def: true },
        artifact: {
            size: fs.statSync(versionJsonPath).size,
            MD5: crypto.createHash('md5').update(fs.readFileSync(versionJsonPath)).digest('hex'),
            url: `https://raw.githubusercontent.com/thiagolima-hue/LAUNCHER-TRINITY/main/versions/${manifestId}.json`,
            path: `${manifestId}.json`
        }
    });

    // 3. Bibliotecas
    for (const lib of versionData.libraries) {
        if (lib.name.includes('minecraftforge')) continue;

        let libUrl, libPath;
        let libMD5 = "00000000000000000000000000000000";

        if (lib.downloads && lib.downloads.artifact) {
            libUrl = lib.downloads.artifact.url;
            libPath = lib.downloads.artifact.path;
        } else {
            // Geração de Caminho Maven Correta
            const parts = lib.name.split(':');
            const group = parts[0];
            const artifact = parts[1];
            const version = parts[2];

            const groupPath = group.replace(/\./g, '/');
            libPath = `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;

            // Roteamento Inteligente de Repositórios
            const isNeoForgeLib = [
                'net.neoforged',
                'cpw.mods',
                'com.electronwill',
                'net.jodah',
                'net.minecrell',
                'net.fabricmc',
                'org.ow2.asm',
                'org.apache',
                'org.codehaus',
                'org.jline'
            ].some(prefix => group.startsWith(prefix));

            if (isNeoForgeLib) {
                libUrl = `https://maven.neoforged.net/releases/${libPath}`;
            } else {
                libUrl = `https://libraries.minecraft.net/${libPath}`;
            }
        }

        // Caso especial: NeoForm (Dropbox)
        if (lib.name.includes('neoform')) {
            libUrl = `https://www.dropbox.com/scl/fi/6mf8tv93zt03ef67msvwz/neoform-1.21.1-20240808.144430.zip?rlkey=x8w8xyutc9my2fra6ybppfro8&st=wyad5ky8&dl=1`;
            libPath = `net/neoforged/neoform/1.21.1-20240808.144430/neoform-1.21.1-20240808.144430.jar`;
            libMD5 = "3f43262b8c492966bd170e4b78f313fe";
        }

        neoforgeModule.subModules.push({
            id: lib.name,
            name: lib.name.split(':')[1],
            type: "Library",
            required: { value: true, def: true },
            artifact: {
                size: (lib.downloads && lib.downloads.artifact) ? lib.downloads.artifact.size : 0,
                MD5: libMD5,
                url: libUrl,
                path: libPath
            }
        });
    }

    // INJEÇÃO DO CLIENT.JAR (DENTRO DO ESCOPO)
    neoforgeModule.subModules.push({
        id: "com.mojang:minecraft-client:1.21.1",
        name: "Minecraft Client",
        type: "Library",
        required: { value: true, def: true },
        artifact: {
            size: 0,
            MD5: "4f4bd402da16086208a13915152a55925a1f2677",
            url: "https://piston-data.mojang.com/v1/objects/4f4bd402da16086208a13915152a55925a1f2677/client.jar",
            path: "../versions/1.21.1/client.jar"
        }
    });

    server.modules.push(neoforgeModule);

    // 4. Mods
    if (fs.existsSync(modsDir)) {
        const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
        for (const file of files) {
            const modId = file.replace('.jar', '').replace(/[^a-zA-Z0-9.-]/g, '_');
            const isPixelmon = file.toLowerCase().includes('pixelmon');

            let modUrl = `https://raw.githubusercontent.com/thiagolima-hue/LAUNCHER-TRINITY/main/mods/${file}`;
            let modMD5 = crypto.createHash('md5').update(fs.readFileSync(path.join(modsDir, file))).digest('hex');

            if (isPixelmon) {
                modUrl = "https://www.dropbox.com/scl/fi/tn8w6izxlt8npwpo4gvcm/Pixelmon-1.21.1-9.3.14-universal.jar?rlkey=bj04frkfkmzviqqbcrdy9cwoc&st=fd6edy6c&dl=1";
                // IMPORTANTE: Para o Dropbox não dar erro de MD5, usamos o valor fixo ou 0
                modMD5 = "16b4735ab6775939fd085a4a9c5f60a1";
            }

            server.modules.push({
                id: `local.mod:${modId}:1.0.0`,
                name: file,
                type: "ForgeMod",
                required: { value: true, def: true },
                artifact: {
                    size: fs.statSync(path.join(modsDir, file)).size,
                    MD5: modMD5,
                    url: modUrl,
                    path: `mods/${file}`
                }
            });
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify({ version: "1.0.0", servers: [server] }, null, 2));
    console.log('DONE! Distribution generated with client.jar and NeoForm mappings.');
}

generate();
