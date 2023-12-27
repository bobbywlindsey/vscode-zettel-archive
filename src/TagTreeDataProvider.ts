import * as vscode from 'vscode';
import * as path from 'path';
import { NoteParser } from './NoteParser';
import { NoteWorkspace } from './NoteWorkspace';

export class TagTreeDataProvider implements vscode.TreeDataProvider<TagItem> {
  constructor(private workspaceRoot: string | null) {}
  _onDidChangeTreeData: vscode.EventEmitter<TagItem | undefined | void> = new vscode.EventEmitter<TagItem | undefined | void>();
  onDidChangeTreeData: vscode.Event<TagItem | undefined | void> = this._onDidChangeTreeData.event;
  reload(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TagItem): vscode.TreeItem {
    element.command = {
      command: 'vscode.open',
      arguments: [
        element.location?.uri.fsPath,
      ],
      title: 'Open File',
    };
    return element;
  }

  getChildren(): Thenable<TagItem[]> {
    // If you're not in the text editor, display nothing
    let f = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!f) {
      // No activeTextEditor, so there can be no refs
      return Promise.resolve([]);
    }
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No refs in empty workspace');
      return Promise.resolve([]);
    }
    let structureTag = NoteWorkspace.structureTag().replace('#', '');
    return NoteParser.searchNotesFor(structureTag).then((locations) => {
      return Promise.resolve(locations.map((l) => TagItem.fromLocation(l)));
    });
  }
}

class TagItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public location?: vscode.Location,
  ) {
    super(label, collapsibleState);
  }

  // Display file names containing given tag
  static fromLocation(location: vscode.Location): TagItem {
    let label = path.basename(location.uri.fsPath);
    let cs = vscode.TreeItemCollapsibleState.None;
    return new TagItem(label, cs, location);
  }
}
