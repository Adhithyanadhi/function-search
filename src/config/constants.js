require('../utils/logger');
const path = require('path');

const FILE_EXTRACT_FILE_PATH = path.join(__dirname, '../services/workers/extractFileNameWorker.js');
const DISK_WORKER_FILE_PATH = path.join(__dirname, '../services/workers/diskWorker.js');
const FUNCTION_EXTRACT_FILE_PATH = path.join(__dirname, '../services/workers/extractFunctionNameWorker.js');

let INVALID_DIR_FRAGMENTS = [
  // VCS / IDE
  "/.git/",
  "/.svn/",
  "/.hg/",
  "/.bzr/",
  "/.idea/",
  "/.vscode/",
  "/.vs/",
  "/.history/",

  // JS / TS / frontend deps & build
  "/node_modules/",
  "/bower_components/",
  "/jspm_packages/",
  "/.next/",
  "/.nuxt/",
  "/.svelte-kit/",
  "/.angular/cache/",
  "/.turbo/",
  "/.parcel-cache/",
  "/.rollup.cache/",
  "/.eslintcache",

  // Generic build output (usually generated, not source of truth)
  "/dist/",
  "/build/",
  "/out/",
  "/release/",
  "/debug/",
  "/.cache/",

  // Python deps / caches
  "/__pycache__/",
  "/.pytest_cache/",
  "/.mypy_cache/",
  "/.ruff_cache/",
  "/.tox/",
  "/.nox/",
  "/.ipynb_checkpoints/",
  "/site-packages/",
  "/.venv/",
  "/venv/",
  // (intentionally *not* excluding plain `/env/` because it can be user data)

  // JVM stuff
  "/.gradle/",
  "/.mvn/",
  "/target/",

  // PHP / Composer
  "/vendor/",

  // Ruby / Bundler
  "/.bundle/",
  "/vendor/bundle/",

  // Rust / Go
  "/.cargo/",
  "/target/",
  "/pkg/",
  "/.cache/go-build/",

  // C / C++ / CMake
  "/CMakeFiles/",
  "/cmake-build-debug/",
  "/cmake-build-release/",

  // System-y junk
  "/.Trash-",
  "/lost+found/"
];


const FILE_EDIT_DEBOUNCE_DELAY = 2000;
const ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY = 200;
const PROCESS_FILE_TIME_OUT = 2000;
const SEARCH_TIMER_TIMEOUT = 150;
const MAX_INGRES_X_FUNCTION = 1000;
const X_FUNCTION_INGRES_TIMEOUT = 10;
const SNAPSHOT_TO_DISK_INTERVAL = 10 * 60 * 1000;
const MILLISECONDS_PER_DAY = 86400000; // 24 * 60 * 60 * 1000

const FILE_PROPERTIES = {
    ".py": {
        regex: [/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/],
        fileIcon: 'py.svg',
    },
    ".rb": {
        regex: [/^\s*def\s+(?:self\.)?([a-zA-Z_][a-zA-Z0-9_!?]*)\s*/],
        fileIcon: 'rb.svg',
    },
    ".go": {
        regex:[ /^\s*func\s+(?:[\w\s,*]*\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*/],
        fileIcon: 'go.svg',
    },
    ".java": {
        regex: [/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:[\w<>\[\],]+\s+)+(?!if|for|while|switch|catch)([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
        fileIcon: 'java.svg',
    },
    ".js": {
        regex:[ /^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/],
        fileIcon: 'js.svg',
    },
    ".ts": {
        regex:[ /^\s*(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/],
        fileIcon: 'ts.svg',
    },
    ".kt": {
        regex:[ /^\s*fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*/],
    },
    ".c": {
        regex: [/^\s*(?:[a-zA-Z_][\w\s\*]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
        fileIcon: 'c.svg'
    },
    ".cpp": {
        regex:[ /^\s*(?:[a-zA-Z_][\w\s:<>\*&]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
        fileIcon: 'cpp.svg'
    },
    ".cs": {
        regex: [/^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?[\w<>\[\],\s]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
    },
    ".php": {
        regex: [/^\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
    },
    ".rs": {
        regex: [/\s*fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
        fileIcon: 'rs.svg',
    },
    ".swift": {
        regex: [/^\s*func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/],
    }
};

const supportedExtensions = Object.keys(FILE_PROPERTIES);
const WORKSPACE_RELATIVE_FILE_MATCH_PATTERN = `**/*{${  supportedExtensions.join(',')  }}`

const EXTRACT_FILE_NAMES = 'extractFileNames';
const EXTRACT_FUNCTION_NAMES = 'extractFunctionNames';
const FETCHED_FUNCTIONS = 'fetchedFunctions';
const WRITE_CACHE_TO_FILE = 'write-cache-to-file';
const INODE_MODIFIED_AT = 'inodemodifiedat';
const DELETE_ALL_CACHE = 'delete-all-cache';
const UPDATE_REGEX_CONFIG = 'update-regex-config';
const UPDATE_IGNORE_CONFIG = 'update-ignore-config';

function get_invalid_dir_fragments(){
    return INVALID_DIR_FRAGMENTS;
}

function set_invalid_dir_fragments(x){
    INVALID_DIR_FRAGMENTS.push(...x);
    INVALID_DIR_FRAGMENTS = [...new Set(INVALID_DIR_FRAGMENTS)];
}

module.exports = {
    SNAPSHOT_TO_DISK_INTERVAL,
    DISK_WORKER_FILE_PATH,
    FILE_EXTRACT_FILE_PATH,
    FUNCTION_EXTRACT_FILE_PATH,
    WORKSPACE_RELATIVE_FILE_MATCH_PATTERN,
    SEARCH_TIMER_TIMEOUT,
    FILE_PROPERTIES,
    PROCESS_FILE_TIME_OUT,
    supportedExtensions,
    FILE_EDIT_DEBOUNCE_DELAY,
    MAX_INGRES_X_FUNCTION,
    X_FUNCTION_INGRES_TIMEOUT,
    ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY,
    MILLISECONDS_PER_DAY,
    EXTRACT_FILE_NAMES,
    EXTRACT_FUNCTION_NAMES,
    FETCHED_FUNCTIONS,
    WRITE_CACHE_TO_FILE,
    INODE_MODIFIED_AT,
    UPDATE_REGEX_CONFIG,
    UPDATE_IGNORE_CONFIG,
    DELETE_ALL_CACHE,
    get_invalid_dir_fragments,
    set_invalid_dir_fragments,
};


