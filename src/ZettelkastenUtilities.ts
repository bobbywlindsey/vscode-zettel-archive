import * as vscode from 'vscode';

export default class ZettelkastenUtilities {
  static generateId() {
    const date = new Date();
    const year = date.getFullYear();
    var month = String(date.getMonth()+1);
    if (Number(month) <= 9) {
      month = `0${month}`;
    }
    var day = String(date.getDate());
    if (Number(day) <= 9) {
      day = `0${day}`;
    }
    var hour = String(date.getHours());
    if (Number(hour) <= 9) {
      hour = `0${hour}`;
    }
    var min = String(date.getMinutes());
    if (Number(min) <= 9) {
      min = `0${min}`;
    }
    const id = [
      year,
      month,
      day,
      hour,
      min
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