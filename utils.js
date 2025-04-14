function isSubsequence(sub, target) {
	let i = 0, j = 0;
	while (i < sub.length && j < target.length) {
		if (sub[i] === target[j]) i++;
		j++;
	}
    if(sub == "starttimei" && i === sub.length){
        console.log(sub, target)
    }
	return i === sub.length;
}


function getDirPath(file_path) {
	return file_path.substring(0, file_path.lastIndexOf("/"));
}

function getExtentionFromFilePath(file){
    return '.'+file.split('.').pop()
}


module.exports = { isSubsequence, getDirPath, getExtentionFromFilePath};
