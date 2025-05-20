const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;

function getWorkspaceKey(workspacePath) {
  let hash = 5381;
  for (let i = 0; i < workspacePath.length; i++) {
    hash = ((hash << 5) + hash) + workspacePath.charCodeAt(i); // hash * 33 + c
  }
  return 'ws_' + (hash >>> 0).toString(36); // unsigned & base36 for short ID
}

let inodePath = '';
let indexPath = '';

async function InitializeEnvs(context, workspacePath) {
  const workspaceKey = getWorkspaceKey(workspacePath);

  const baseDirUri = vscode.Uri.joinPath(
    context.globalStorageUri,
    'meta_data',
    workspaceKey
  );

  fs.mkdir(baseDirUri.fsPath, { recursive: true });

  inodePath = path.join(baseDirUri.fsPath, 'inodeModifiedAt.json');
  indexPath = path.join(baseDirUri.fsPath, 'functionIndex.json');
}

function getInodeModifiedAtFilePath() {
  return inodePath;
}

function getFunctionIndexFilePath() {
  return indexPath;
}

module.exports = {
  InitializeEnvs,
  getInodeModifiedAtFilePath,
  getFunctionIndexFilePath
};
