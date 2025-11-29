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


function normalizeEntries(entries) {
  if (!entries) return [];
  if (entries instanceof Map) {
    const out = [];
    for (const [fileName, obj] of entries) {
      out.push([fileName, obj?.lastAccessedAt ?? 0, obj?.inodeModifiedAt ?? null]);
    }
    return out;
  }
  // assume array of tuples or objects
  return Array.from(entries, (e) => {
    if (Array.isArray(e)) {
      return [e[0], e[1] ?? 0, e[2] ?? null];
    }
    if (e && typeof e === 'object') {
      return [e.fileName, e.lastAccessedAt ?? 0, e.inodeModifiedAt ?? null];
    }
    return [String(e), 0, null];
  });
}


module.exports = { isSubsequence, getDirPath, getExtensionFromFilePath, isExcluded, prioritizeCurrentFileExt, resetInterval, getSetFromListFunction, normalizeEntries};




