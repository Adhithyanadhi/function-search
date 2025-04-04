const functionRegexMap = {
    "py": [/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
    "rb": [/^\s*def\s+(?:self\.)?([a-zA-Z_][a-zA-Z0-9_!?]*)\s*\(/, 1],
    "go": [/^\s*func\s+(?:\([\w\s,*]*\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
    "java": [/^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
    "js": [/^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
    "ts": [/^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
};

const supportedExtensions = Object.keys(functionRegexMap);
const invalidFilePathSuffix = [".min.js"]
const FILE_EDIT_DEBOUNCE_DELAY = 1000; // milliseconds
const   PROCESS_FILE_TIME_OUT = 1000; // milliseconds


module.exports = {functionRegexMap, supportedExtensions, FILE_EDIT_DEBOUNCE_DELAY};
