require('./logger');
const path = require('path');
const { get_invalid_dir_fragments, INODE_FOLDER_BUCKET } = require('../config/constants');

function isSubsequence(sub, target) {
    let i = 0, j = 0;
    while (i < sub.length && j < target.length) {
        if (sub[i] === target[j]) {i++;}
        j++;
    }
    return i === sub.length;
}

function getDirPath(file_path) {
    return file_path.substring(0, file_path.lastIndexOf("/"));
}

function getExtensionFromFilePath(file) {
    return `.${  file.split('.').pop()}`
}

function prioritizeCurrentFileExt(functionList, currentFileExtension) {
    if (currentFileExtension === '') {return functionList;}
    const sameExt = [];
    const others = [];

    for (const fn of functionList) {
        if (fn.extension === currentFileExtension) {
            sameExt.push(fn);
        } else {
            others.push(fn);
        }
    }

    return [...sameExt, ...others];
}


function resetInterval(handle){
    clearInterval(handle);
}


function getSetFromListFunction(arr) {
    const set = new Set();
    for (const f of arr) {
        if (f) {
            set.add(f.name);
        }
    }
    return set;
}


function isExcluded(filePath) {
    return !filePath || get_invalid_dir_fragments().some(suffix => filePath.includes(suffix));
}

// Contract: deep equality is only used with JSON-safe config values.
function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function getInodeBucketForPath(filePath) {
    const ext = path.extname(filePath || '');
    return ext || INODE_FOLDER_BUCKET;
}

function toInodeBucketMap(fileMap) {
    if (fileMap instanceof Map) {
        return fileMap;
    }
    const bucket = new Map();
    for (const [filePath, modifiedAt] of Object.entries(fileMap || {})) {
        bucket.set(filePath, modifiedAt);
    }
    return bucket;
}

function partitionInodeModifiedAt(flatInodeMap) {
    const data = new Map();
    if (!flatInodeMap) {
        return data;
    }

    for (const [filePath, modifiedAt] of flatInodeMap.entries()) {
        if (!filePath) {
            continue;
        }
        const ext = getInodeBucketForPath(filePath);
        const bucket = data.get(ext) || new Map();
        bucket.set(filePath, modifiedAt);
        data.set(ext, bucket);
    }
    return data;
}

function flattenInodeModifiedAtEntries(entries) {
    const flat = [];
    const sourceEntries = entries instanceof Map ? entries.entries() : (entries || []);
    for (const [, fileMap] of sourceEntries) {
        const bucket = toInodeBucketMap(fileMap);
        for (const [filePath, modifiedAt] of bucket.entries()) {
            flat.push([filePath, modifiedAt]);
        }
    }
    return flat;
}

module.exports = {
    isSubsequence,
    getDirPath,
    getExtensionFromFilePath,
    prioritizeCurrentFileExt,
    isExcluded,
    resetInterval,
    getSetFromListFunction,
    deepEqual,
    getInodeBucketForPath,
    toInodeBucketMap,
    partitionInodeModifiedAt,
    flattenInodeModifiedAtEntries
};
