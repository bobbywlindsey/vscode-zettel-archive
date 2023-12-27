import * as vscode from 'vscode';
import { BacklinksTreeDataProvider } from './BacklinksTreeDataProvider';
import { TagTreeDataProvider } from './TagTreeDataProvider';
import { MarkdownDefinitionProvider } from './MarkdownDefinitionProvider';
import { MarkdownReferenceProvider } from './MarkdownReferenceProvider';
import { MarkdownFileCompletionItemProvider } from './MarkdownFileCompletionItemProvider';
import { NoteWorkspace } from './NoteWorkspace';
import { NoteParser } from './NoteParser';
import { getRefAt, RefType } from './Ref';
import { pluginSettings } from './MarkdownRenderingPlugin';

export function activate(context: vscode.ExtensionContext) {
  const ds = NoteWorkspace.DOCUMENT_SELECTOR;
  // Auto-completion of wiki-links and tags
  NoteWorkspace.overrideMarkdownWordPattern();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(ds, new MarkdownFileCompletionItemProvider())
  );

  // Resolve wiki-link (for us, Zettel ID) to file
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(ds, new MarkdownDefinitionProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(ds, new MarkdownReferenceProvider())
  );

  vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
    NoteParser.updateCacheFor(e.document.uri.fsPath);

    // Trigger suggestion when altering the wiki-link
    // See discussion on https://github.com/kortina/vscode-markdown-notes/pull/69/
    const shouldSuggest = e.contentChanges.some((change) => {
      const ref = getRefAt(e.document, change.range.end);
      return ref.type != RefType.Null;
    });
    if (shouldSuggest) {
      vscode.commands.executeCommand('editor.action.triggerSuggest');
    }
  });

  // Command for creating new note with timestamp included
  const newNoteCommand = vscode.commands.registerCommand(
    'vscodeZettelArchive.newNote',
    NoteWorkspace.newNote
  );
  context.subscriptions.push(newNoteCommand);

  // Parse the tags from every file in the workspace
  NoteParser.hydrateCache();

  // Show backlinks in explorer
  const defaultWorkspace = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const backlinksTreeDataProvider = new BacklinksTreeDataProvider(
    defaultWorkspace || null
  );
  vscode.window.onDidChangeActiveTextEditor(() => backlinksTreeDataProvider.reload());
  const backlinksTreeView = vscode.window.createTreeView('vscodeZettelArchiveBacklinks', {
    treeDataProvider: backlinksTreeDataProvider,
  });

  // Show structure notes in explorer
  const tagTreeDataProvider = new TagTreeDataProvider(
    defaultWorkspace || null
  );
  vscode.window.onDidChangeActiveTextEditor(() => tagTreeDataProvider.reload());
  const tagTreeView = vscode.window.createTreeView('vscodeZettelArchiveStructureNotes', {
    treeDataProvider: tagTreeDataProvider,
  });

  // See: https://code.visualstudio.com/api/extension-guides/markdown-extension
  // For more information on how this works.
  return {
    extendMarkdownIt(md: any) {
      return md.use(pluginSettings());
    },
  };
}