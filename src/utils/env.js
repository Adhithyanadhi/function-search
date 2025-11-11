const fs = require('fs');
const path = require('path');

function loadEnv() {
    try {
        const envPath = path.join(__dirname, '../../.env');
        const data = fs.readFileSync(envPath, 'utf8');
        for (const rawLine of data.split('\n')) {
            const line = (rawLine || '').trim();
            if (!line || line.startsWith('#')) {continue;}
            const eq = line.indexOf('=');
            if (eq === -1) {continue;}
            const key = line.slice(0, eq).trim();
            let value = line.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
                value = value.slice(1, -1);
            }
            if (process.env[key] == null) {process.env[key] = value;}
        }
    } catch {}
}

module.exports = { loadEnv };


