function getExtentionFromFilePath(file){
    return '.'+file.split('.').pop()
}

module.exports = {getExtentionFromFilePath}