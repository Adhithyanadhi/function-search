require('./logger');
const path = require('path');
const { get_invalid_dir_fragments, supportedExtensions } = require('../config/constants');

function isSubsequence(sub, target) {
    if(target == null || target == "") {return true;}
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

module.exports = { isSubsequence, getDirPath, getExtensionFromFilePath, prioritizeCurrentFileExt, isExcluded, resetInterval, getSetFromListFunction};



