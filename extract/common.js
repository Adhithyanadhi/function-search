const fs   = require('fs');
const path = require('path');

function extractFunctionsFromFile(filePath, relativeFilePath, regex) {
    const functionList = [];
    
    if (!fs.existsSync(filePath)) return functionList;

    const fileContent = fs.readFileSync(filePath, 'utf8');
    fileContent.split('\n').forEach((line, index) => {
        const match = line.match(regex);
        if (!match) return;                

        functionList.push({
            name: match[1],
            file: filePath,
            line: index + 1,
            relativeFilePath,
        });
    });

    return functionList;
}

module.exports = {extractFunctionsFromFile};
