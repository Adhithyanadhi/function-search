const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');

loadEnv();

const LEVELS = { off: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const envLevel = (process.env.FUNCTION_SEARCH_LOG_LEVEL || 'error').toLowerCase();
const CURRENT_LEVEL = LEVELS[envLevel] != null ? LEVELS[envLevel] : LEVELS.error;


const logDir = path.join(__dirname, '../../logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch {}

const logFile = path.join(logDir, 'output.log');

const MAX_LOG_SIZE = parseInt(process.env.FUNCTION_SEARCH_MAX_LOG_SIZE_BYTES || '', 10) || (5 * 1024 * 1024);
function deleteIfTooLarge(filePath) {
    try {
        const st = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        if (st && st.size > MAX_LOG_SIZE) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    } catch {}
}

deleteIfTooLarge(logFile);

let logStream;
try { logStream = fs.createWriteStream(logFile, { flags: 'a' }); } catch {}


function write(stream, prefix, args){
    try {
        if (!stream) {return;}
        const line = `[${prefix} ${new Date().toISOString()}] ${args.map(String).join(' ')}\n`;
        stream.write(line);
    } catch {}
}

function shouldLog(levelName){
    const lvl = LEVELS[levelName] || 0;
    return CURRENT_LEVEL >= lvl;
}

const logger = {
    info: (...args) => {
        if (!shouldLog('info')) {return;}
        write(logStream, 'INF', args);
    },
    warn: (...args) => {
        if (!shouldLog('warn')) {return;}
        write(logStream, 'WRN', args);
    },
    debug: (...args) => {
        if (!shouldLog('debug')) {return;}
        write(logStream, 'DBG', args);
    },
    trace: (...args) => {
        if (!shouldLog('trace')) {return;}
        const traceArgs = args && args.length > 0 ? args : ['trace'];
        write(logStream, 'TRC', traceArgs);
    },
    error: (...args) => {
        if (!shouldLog('error')) {return;}
        write(logStream, 'ERR', args);
    },
};

module.exports = logger;