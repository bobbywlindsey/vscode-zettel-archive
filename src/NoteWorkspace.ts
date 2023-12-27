import * as vscode from 'vscode';
import { basename, dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import findNonIgnoredFiles from './findNonIgnoredFiles';
import ZettelkastenUtilities from './ZettelkastenUtilities';

export const foo = () => {
  return 1;
};

type Config = {
  structureTag: string;
}

// This class contains:
// 1. an interface to some of the basic user configurable settings or this extension
// 2. command for creating a New Note
// 3. some other bootstrapping
export class NoteWorkspace {
  // Defining these as strings now, and then compiling them with accessor methods.
  // This will allow us to potentially expose these as settings.
  static _rxTagNoAnchors = '\\#[\\w\\-\\_]+'; // used to match tags that appear within lines
  static _rxTagWithAnchors = '^\\#[\\w\\-\\_]+$'; // used to match entire words
  static _rxWikiLink = '\\[\\[[^sep\\]]+(sep[^sep\\]]+)?\\]\\]|\\[\\[\\]\\]'; // [[wiki-link-regex(|with potential pipe)?]] Note: "sep" will be replaced with pipedWikiLinksSeparator on compile
  static _rxTitle = '(?<=^( {0,3}#[^\\S\\r\\n]+)).+';
  static _rxMarkdownWordPattern = '([\\_\\w\\#\\.\\/\\\\]+)'; // had to add [".", "/", "\"] to get relative path completion working and ["#"] to get tag completion working
  static _rxFileExtensions = '\\ -.*.(md|markdown)$'; // All files like "[12 digit id] - my note.md"

  static DEFAULT_CONFIG: Config = {
    structureTag: '#structure'
  }

  static DOCUMENT_SELECTOR = [
    { language: 'markdown' },
    { language: 'mdx' },
  ];

  // Cache object to store results from noteFiles() in order to provide a synchronous method to the preview renderer.
  static noteFileCache: vscode.Uri[] = [];

  static cfg(): Config {
    let c = vscode.workspace.getConfiguration('vscodeZettelArchive');
    return {
      structureTag: c.get('structureTag') as string
    };
  }

  static structureTag(): string {
    return this.cfg().structureTag;
  }

  static rxTagNoAnchors(): RegExp {
    // NB: MUST have g flag to match multiple words per line
    // return /\#[\w\-\_]+/i; // used to match tags that appear within lines
    return new RegExp(this._rxTagNoAnchors, 'gi');
  }
  static rxTagWithAnchors(): RegExp {
    // NB: MUST have g flag to match multiple words per line
    // return /^\#[\w\-\_]+$/i; // used to match entire words
    return new RegExp(this._rxTagWithAnchors, 'gi');
  }
  static rxWikiLink(): RegExp {
    return new RegExp(this._rxWikiLink, 'gi');
  }
  static rxTitle(): RegExp {
    return new RegExp(this._rxTitle, 'gi');
  }
  static rxMarkdownWordPattern(): RegExp {
    return new RegExp(this._rxMarkdownWordPattern); // 'gi' all matches, case-insensitive
  }
  static rxFileExtensions(): RegExp {
    return new RegExp(this._rxFileExtensions, 'i');
  }

  static wikiLinkCompletionForConvention(
    uri: vscode.Uri,
  ): string {
      return this._wikiLinkCompletionForConvention(basename(uri.fsPath));
  }

  static _wikiLinkCompletionForConvention(filename: string): string {
      return this.stripExtension(filename).split('-')[0].trim();
  }

  static stripExtension(noteName: string): string {
    return noteName.replace(NoteWorkspace.rxFileExtensions(), '');
  }

  static normalizeNoteNameForFuzzyMatch(noteName: string): string {
    // remove the brackets:
    let n = noteName.replace(/[\[\]]/g, '');
    // remove the filepath:
    // NB: this may not work with relative paths?
    n = basename(n);
    // remove the extension:
    n = this.stripExtension(n);
    return n;
  }


  static normalizeNoteNameForFuzzyMatchText(noteName: string): string {
    // remove the brackets:
    let n = noteName.replace(/[\[\]]/g, '');
    // remove the extension:
    n = this.stripExtension(n);
    return n;
  }

  // Compare 2 wiki-links for a fuzzy match.
  // In general, we expect
  // `left` to be fsPath
  // `right` to be the ref word [[wiki-link]]
  static noteNamesFuzzyMatch(left: string, right: string): boolean {
    // Support The Archive / Zettlr-style IDs
    const id = right.match(/^\d{12}$/);
    if (id) { return left.includes(id[0]); }

    return (
      this.normalizeNoteNameForFuzzyMatch(left).toLowerCase() ==
      this.normalizeNoteNameForFuzzyMatchText(right).toLowerCase()
    );
  }

  static noteNamesFuzzyMatchText(left: string, right: string): boolean {
    return (
      this.normalizeNoteNameForFuzzyMatchText(left).toLowerCase() ==
      this.normalizeNoteNameForFuzzyMatchText(right).toLowerCase()
    );
  }

  static cleanTitle(title: string): string {
    return title
      .toLowerCase() // lower
      .replace(/[-_－＿ ]*$/g, ''); // removing trailing slug chars
  }

  static noteFileNameFromTitle(title: string, id: string = ""): string {
    let fullTitle = [id, title].filter(s => s.length > 0).join(' - ');
    return fullTitle.match(this.rxFileExtensions()) ? fullTitle : `${fullTitle}.md`;
  }

  static newNote(context: vscode.ExtensionContext) {
    const inputBoxPromise = vscode.window.showInputBox({
      prompt:
        'Enter a title for your new note.',
      value: '',
    });

    inputBoxPromise.then(
      (noteTitle) => {
        if (noteTitle == null || !noteTitle || noteTitle.replace(/\s+/g, '') == '') {
          // console.debug('Abort: noteTitle was empty.');
          return false;
        }
        const { filepath, fileAlreadyExists } = NoteWorkspace.createNewNoteFile(noteTitle);

        // open the file:
        vscode.window
          .showTextDocument(vscode.Uri.file(filepath), {
            preserveFocus: false,
            preview: false,
          })
          .then(() => {
            // if we created a new file, hop to line #3
            if (!fileAlreadyExists) {
              let editor = vscode.window.activeTextEditor;
              if (editor) {
                const lineNumber = 3;
                let range = editor.document.lineAt(lineNumber - 1).range;
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range);
              }
            }
          });
      },
      (err) => {
        vscode.window.showErrorMessage('Error creating new note.');
      }
    );
  }

  static createNewNoteFile(noteTitle: string) {
    let workspacePath = '';
    if (vscode.workspace.workspaceFolders) {
      workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath.toString();
    }
    const activeFile = vscode.window.activeTextEditor?.document;
    let activePath = activeFile ? dirname(activeFile.uri.fsPath) : '';

    const zettelId = ZettelkastenUtilities.generateId();
    const filename = NoteWorkspace.noteFileNameFromTitle(noteTitle, zettelId);
    const filepath = join(activePath, filename);

    const fileAlreadyExists = existsSync(filepath);
    if (fileAlreadyExists) {
      vscode.window.showWarningMessage(
        `Error creating note, file at path already exists: ${filepath}`
      );
    } else {
      // Create the file if it does not exist
      const contents = NoteWorkspace.newNoteContent(noteTitle, zettelId);
      writeFileSync(filepath, contents);
    }

    return {
      filepath: filepath,
      fileAlreadyExists: fileAlreadyExists,
    };
  }

  // Insert note name as a header in the new file
  static newNoteContent(noteName: string, zettelId: string = "") {
    return `# ${zettelId} - ${noteName}\n\n`;
  }

  static overrideMarkdownWordPattern() {
    this.DOCUMENT_SELECTOR.map((ds) => {
      vscode.languages.setLanguageConfiguration(ds.language, {
        wordPattern: this.rxMarkdownWordPattern(),
      });
    });
  }

  static async noteFiles(): Promise<Array<vscode.Uri>> {
    let that = this;

    let files = await vscode.workspace.findFiles('**/*');
    // let files = await findNonIgnoredFiles('**/*');
    files = files.filter((f) => f.scheme == 'file' && f.path.match(that.rxFileExtensions()));
    this.noteFileCache = files;
    return files;
  }

  static noteFilesFromCache(): Array<vscode.Uri> {
    return this.noteFileCache;
  }
}

