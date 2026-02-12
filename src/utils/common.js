require('./logger');
const path = require('path');
const { get_invalid_dir_fragments, supportedExtensions } = require('../config/constants');

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

function normalizeUserConfig(cfg) {
    const regexes = (cfg && cfg.regexes && typeof cfg.regexes === 'object' && !Array.isArray(cfg.regexes))
        ? cfg.regexes
        : {};
    const ignore = (cfg && Array.isArray(cfg.ignore)) ? cfg.ignore : [];
    return { regexes, ignore };
}

function deepEqual(a, b) {
    if (a === b) { return true; }
    if (typeof a !== typeof b) { return false; }
    if (a && b && typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) { return false; }
        if (Array.isArray(a)) {
            if (a.length !== b.length) { return false; }
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) { return false; }
            }
            return true;
        }
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) { return false; }
        for (const k of aKeys) {
            if (!deepEqual(a[k], b[k])) { return false; }
        }
        return true;
    }
    return false;
}

module.exports = {
    isSubsequence,
    getDirPath,
    getExtensionFromFilePath,
    prioritizeCurrentFileExt,
    isExcluded,
    resetInterval,
    getSetFromListFunction,
    normalizeUserConfig,
    deepEqual
};


