const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, 'output.log');
const errorFile = path.join(logDir, 'error.log');

const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    const line = `[LOG ${new Date().toISOString()}] ${args.join(' ')}\n`;
    logStream.write(line);
    originalLog.apply(console, args); // still prints to terminal
};

console.error = (...args) => {
    const line = `[ERR ${new Date().toISOString()}] ${args.join(' ')}\n`;
    errorStream.write(line);
    originalError.apply(console, args);
};
