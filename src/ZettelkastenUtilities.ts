import * as vscode from 'vscode';

export default class ZettelkastenUtilities {
  static generateId() {
    const date = new Date();
    const id = [
      date.getFullYear(),
      date.getMonth()+1,
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ].join('');
    return id;
  }

  static insertId() {
    const editor = vscode.window.activeTextEditor;
    if (editor == null) return;

    const newId = ZettelkastenUtilities.generateId();
    editor.insertSnippet(new vscode.SnippetString(newId));
  }
}