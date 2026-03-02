require('./logger');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;

function getWorkspaceKey(workspacePath) {
  let hash = 5381;
  for (let i = 0; i < workspacePath.length; i++) {
    hash = ((hash << 5) + hash) + workspacePath.charCodeAt(i);
  }
  return `ws_${  (hash >>> 0).toString(36)}`;
}

let dbDir = '';
let extensionUri = undefined;

async function initializeEnvironment(context) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) { return; }
  const workspaceKey = getWorkspaceKey(workspacePath);

  let baseDir;
  if (context.globalStorageUri && vscode.Uri && vscode.Uri.joinPath) {
    const baseDirUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      'meta_data',
      workspaceKey
    );
    baseDir = baseDirUri.fsPath;
  } else {
    baseDir = path.join(context.globalStoragePath || __dirname, 'meta_data', workspaceKey);
  }

  await fs.mkdir(baseDir, { recursive: true });

  dbDir = baseDir;
  extensionUri = getExtensionUri();
}

function getDBDir() {
  return dbDir;
}

async function deleteOlderCacheFilesInDbDir() {
  if (!dbDir) { return; }
  try {
    const deleteJsonFilesInDir = async (dirPath) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
      if (jsonFiles.length === 0) { return; }
      await Promise.all(jsonFiles.map((entry) => {
        const filePath = path.join(dirPath, entry.name);
        return fs.unlink(filePath).catch(() => {});
      }));
    };

    await deleteJsonFilesInDir(dbDir);

    const parentDir = path.dirname(dbDir);
    const parentEntries = await fs.readdir(parentDir, { withFileTypes: true });
    const childDirs = parentEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    await Promise.all(childDirs.map((dirName) => {
      const childPath = path.join(parentDir, dirName);
      return deleteJsonFilesInDir(childPath).catch(() => {});
    }));
  } catch {
    // intentionally ignored (low-priority cleanup)
  }
}

function getWorkspacePath() {
  return vscode.workspace?.workspaceFolders?.[0]?.uri?.fsPath
    || vscode.workspace?.rootPath
    || (vscode.window.activeTextEditor ? path.dirname(vscode.window.activeTextEditor.document.fileName) : undefined);
}

function getWorkspaceFolder(workspacePath) {
  const wsPath = workspacePath || getWorkspacePath();
  if (!wsPath) {return undefined;}
  try {
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(wsPath));
  } catch {
    return undefined;
  }
}

function getExtensionUri(){
  if(!extensionUri){
    const ext = vscode.extensions.getExtension('AmbitiousCoder.function-name-search');
    extensionUri = ext?.extensionUri;
  }
  return extensionUri
}

module.exports = {
  initializeEnvironment,
  getDBDir,
  deleteOlderCacheFilesInDbDir,
  getWorkspacePath,
  getExtensionUri,
  getWorkspaceFolder
};
