const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- Starting Distribution Update ---');

try {
    console.log('1. Generating distribution.json from local version.json and mods...');
    execSync('node generate_distribution.js', { stdio: 'inherit', cwd: __dirname });

    console.log('\n2. Downloading validation data (MD5s) for libraries...');
    execSync('node fix_distribution_md5.js', { stdio: 'inherit', cwd: __dirname });

    console.log('\n--- Update Complete! ---');
    console.log('You can now launch the application.');
} catch (error) {
    console.error('\n!!! Error during update process !!!');
    console.error(error.message);
    process.exit(1);
}
