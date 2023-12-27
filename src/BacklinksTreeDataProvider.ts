import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NoteParser } from './NoteParser';

type FileWithLocations = {
  file: string;
  locations: vscode.Location[];
};

export class BacklinksTreeDataProvider implements vscode.TreeDataProvider<BacklinkItem> {
  constructor(private workspaceRoot: string | null) {}
  _onDidChangeTreeData: vscode.EventEmitter<BacklinkItem | undefined | void> = new vscode.EventEmitter<BacklinkItem | undefined | void>();
  onDidChangeTreeData: vscode.Event<BacklinkItem | undefined | void> = this._onDidChangeTreeData.event;
  reload(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BacklinkItem): vscode.TreeItem {
    element.iconPath = element.location ? undefined : new vscode.ThemeIcon('references');
    element.description = BacklinksTreeDataProvider.elementDescription(element);
    element.command = {
      command: 'vscode.open',
      arguments: [
        element.location?.uri.fsPath,
          {
            preview: true,
            selection: element.location?.range,
          },
      ],
      title: 'Open File',
    };
    return element;
  }

  static elementDescription(element: BacklinkItem) {
    let d = ``;
    if (element.location) {
      let lines = (fs.readFileSync(element.location?.uri.fsPath) || '').toString().split(/\r?\n/);
      let line = lines[element.location?.range.start.line];
      // Look back 12 chars before the start of the reference.
      // There is almost certainly a more elegant way to do this.
      let s = element.location?.range.start.character - 12;
      if (s < 20) {
        s = 0;
      }
      return line.substr(s);
    } else if (element.locations) {
      d = `${element.locations?.length} References`;
    }
    return d;
  }

  // Take a flat list of locations, such as:
  // - file1.md, l1
  // - file2.md, l2
  // - file1.md, l3
  // And return as list of files with location lists:
  // - file1.md
  //   - l1
  //   - l3
  // - file2.md
  //   - l2
  // NB: does work well with relativePaths mode, assumes uniqueFilenames
  static locationListToTree(locations: vscode.Location[]): FileWithLocations[] {
    let m: Record<string, FileWithLocations> = {};
    locations.map((l) => {
      let f = path.basename(l.uri.fsPath);
      if (!m[f]) {
        let fwl: FileWithLocations = {
          file: f,
          locations: [],
        };
        m[f] = fwl;
      }
      m[f].locations.push(l);
    });
    let arr = Object.values(m);
    // sort the files by name:
    let asc = (a: string | number, b: string | number) => {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    };
    arr.sort((a, b) => asc(a.file, b.file));
    // sort the locations in each file by start position:
    return arr.map((fwl) => {
      fwl.locations.sort((locA, locB) => {
        let a = locA.range.start;
        let b = locB.range.start;
        if (a.line < b.line) {
          return -1;
        }
        if (a.line > b.line) {
          return 1;
        }
        // same line, compare chars
        if (a.character < b.character) {
          return -1;
        }
        if (a.character > b.character) {
          return 1;
        }
        return 0;
      });
      return fwl;
    });
  }

  getChildren(element?: BacklinkItem): Thenable<BacklinkItem[]> {
    let f = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!f) {
      // no activeTextEditor, so there can be no refs
      return Promise.resolve([]);
    }
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No refs in empty workspace');
      return Promise.resolve([]);
    }
    let activeFilename = path.basename(f);

    // TOP LEVEL:
    // Parse the workspace into list of FilesWithLocations
    // Return 1 collapsible element per file
    if (!element) {
      return NoteParser.searchBacklinksFor(activeFilename).then((locations) => {
        let filesWithLocations = BacklinksTreeDataProvider.locationListToTree(locations);
        return filesWithLocations.map((fwl) => BacklinkItem.fromFileWithLocations(fwl));
      });
      // Given the collapsible elements,
      // return the children, 1 for each location within the file
    } else if (element && element.locations) {
      return Promise.resolve(element.locations.map((l) => BacklinkItem.fromLocation(l)));
    } else {
      return Promise.resolve([]);
    }
  }
}

class BacklinkItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public locations?: vscode.Location[],
    public location?: vscode.Location,
    public description?: string
  ) {
    super(label, collapsibleState);
  }

  // Return the 1 collapsible Item for each file
  // Store the locations within that file to the .locations attribute
  static fromFileWithLocations(fwl: FileWithLocations): BacklinkItem {
    let label = fwl.file;
    let cs = vscode.TreeItemCollapsibleState.Expanded;
    return new BacklinkItem(label, cs, fwl.locations, undefined);
  }

  // Items for the locations within files
  static fromLocation(location: vscode.Location): BacklinkItem {
    // location / range is 0-indexed, but editor lines are 1-indexed
    let lineNum = location.range.start.line + 1;
    let label = `${lineNum}:`;
    let cs = vscode.TreeItemCollapsibleState.None;
    return new BacklinkItem(label, cs, undefined, location);
  }
}
