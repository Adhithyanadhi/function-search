const functionRegexMap = {
    "py": [/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/, 1],
    "rb": [/^\s*def\s+(self.)?([a-zA-Z_][a-zA-Z0-9_!?]*)\s*/, 2],
    "go": [/^\s*func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 1],
    "java": [/^\s*(public|private|protected)?\s*(static\s+)?[\w<>\[\]]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 3],
    "js": [/^\s*(async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 2],
    "ts": [/^\s*(async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, 2],
};
const supportedExtensions = ["py", "rb", "go", "java", "js", "ts"];

module.exports = {functionRegexMap, supportedExtensions};
