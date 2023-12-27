import * as vscode from 'vscode';
import { Ref, RefType, getRefAt } from './Ref';
import { NoteWorkspace } from './NoteWorkspace';

// Given a document and position, check whether the current word matches one of
// this context: [[wiki-link]]
//
// If so, we look for a file in the current workspace named by the wiki link
// If the file `wiki-link.md` exists, return the first line of that file as the
// Definition for the word.
//
// Optionally, when no existing note is found for the wiki-link
// vscodeMarkdownNotes.createNoteOnGoToDefinitionWhenMissing = true
// AND vscodeMarkdownNotes.workspaceFilenameConvention = 'uniqueFilenames'
// THEN create the missing file at the workspace root.
export class MarkdownDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    // token: vscode.CancellationToken
  ) {
    const ref = getRefAt(document, position);
    if (ref.type != RefType.WikiLink) {
      return [];
    }

    let files: Array<vscode.Uri> = [];
    files = await MarkdownDefinitionProvider.filesForWikiLinkRef(ref, document);

    const p = new vscode.Position(0, 0);
    return files.map((f) => new vscode.Location(f, p));
  }

  static _filesForWikiLinkRefAndNoteFiles(
    ref: Ref,
    noteFiles: Array<vscode.Uri>
  ): Array<vscode.Uri> {
    let files: Array<vscode.Uri> = [];
    files = noteFiles.filter((f) => {
      return NoteWorkspace.noteNamesFuzzyMatch(f.fsPath, ref.word);
    });
    return files;
  }

  static async filesForWikiLinkRef(
    ref: Ref,
    relativeToDocument: vscode.TextDocument | undefined | null
  ): Promise<Array<vscode.Uri>> {
    let files: Array<vscode.Uri> = await NoteWorkspace.noteFiles();
    return this._filesForWikiLinkRefAndNoteFiles(ref, files);
  }

  static filesForWikiLinkRefFromCache(
    ref: Ref,
    relativeToDocument: vscode.TextDocument | undefined | null
  ) {
    let files = NoteWorkspace.noteFilesFromCache();
    return this._filesForWikiLinkRefAndNoteFiles(ref, files);
  }
}