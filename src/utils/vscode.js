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

function getWorkspacePath() {
  const ws =
    (vscode.workspace && Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri && vscode.workspace.workspaceFolders[0].uri.fsPath)
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : (vscode.workspace && vscode.workspace.rootPath)
        ? vscode.workspace.rootPath
        : (vscode.window.activeTextEditor ? path.dirname(vscode.window.activeTextEditor.document.fileName) : undefined);
  return ws;
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
  getWorkspacePath,
  getExtensionUri,
  getWorkspaceFolder
};


