require('./logger');
const { invalidFilePath } = require('../config/constants');

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

function isExcluded(filePath) {
    return !filePath || invalidFilePath.some(suffix => filePath.includes(suffix));
}

module.exports = { isSubsequence, getDirPath, getExtensionFromFilePath, isExcluded, prioritizeCurrentFileExt };


