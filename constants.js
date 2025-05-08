const path = require('path');

const FILE_PROPERTIES = {
    ".py": {
        regex: /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        fileIcon: path.join(__dirname, "icons", "py.svg"),
    },
    ".rb": {
        regex: /^\s*def\s+(?:self\.)?([a-zA-Z_][a-zA-Z0-9_!?]*)\s*/,
        fileIcon: path.join(__dirname, "icons", "rb.svg"),
    },
    ".go": {
        regex: /^\s*func\s+(?:\([\w\s,*]*\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        fileIcon: path.join(__dirname, "icons", "go.svg"),
    },
    ".java": {
        regex: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[\w<>\[\],\s]+?\s+(?!if|for|while|switch|catch)([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
        fileIcon: path.join(__dirname, "icons", "java.svg"),
    },
    ".js": {
        regex: /^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        fileIcon: path.join(__dirname, "icons", "js.svg"),
    },
    ".ts": {
        regex: /^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        fileIcon: path.join(__dirname, "icons", "ts.svg"),
    },
    ".kt": {
        regex: /^\s*fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
    },
    ".c": {
        regex: /^\s*(?:[a-zA-Z_][\w\s\*]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    },
    ".cpp": {
        regex: /^\s*(?:[a-zA-Z_][\w\s:<>\*&]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    },
    ".cs": {
        regex: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?[\w<>\[\],\s]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    },
    ".php": {
        regex: /^\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    },
    ".rs": {
        regex: /\s*fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    },
    ".swift": {
        regex: /^\s*func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    }
};

const supportedExtensions = Object.keys(FILE_PROPERTIES);
const invalidFilePath = [".min.js", ".git", '.log', '.tmp', '.bak', '.history/', '/tmp/', '/bin/', '/cache/', '.xml', '.class']
const FILE_EDIT_DEBOUNCE_DELAY = 2000; // milliseconds
const PROCESS_FILE_TIME_OUT = 2000; // milliseconds
const SEARCH_TIMER_TIMEOUT = 150;
const WORKSPACE_RELATIVE_FILE_MATCH_PATTERN = '**/*{' + supportedExtensions.join(',') + '}'
const FILE_EXTRACT_FILE_PATH = path.join(__dirname, "./extractFileNameWorker.js");
const FUNCTION_EXTRACT_FILE_PATH = path.join(__dirname, "./extractFunctionNameWorker.js");

module.exports = { FILE_EXTRACT_FILE_PATH, FUNCTION_EXTRACT_FILE_PATH, WORKSPACE_RELATIVE_FILE_MATCH_PATTERN, SEARCH_TIMER_TIMEOUT, FILE_PROPERTIES, PROCESS_FILE_TIME_OUT, supportedExtensions, FILE_EDIT_DEBOUNCE_DELAY, invalidFilePath };
