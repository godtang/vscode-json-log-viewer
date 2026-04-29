import * as vscode from 'vscode';
import { JSONTable } from './jsonTable';

// Track active webviews and their associated documents
interface WebviewEntry {
    panel: vscode.WebviewPanel;
    jsonTable: JSONTable;
    docUri: vscode.Uri;
}

const activeWebviews: WebviewEntry[] = [];

// Debounce timer per document uri
const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

function refreshWebview(entry: WebviewEntry) {
    vscode.workspace.openTextDocument(entry.docUri).then(doc => {
        entry.jsonTable.refresh(doc.getText());
        entry.panel.webview.html = entry.jsonTable.getHTML();
    }, () => { });
}

function scheduleRefresh(docUri: vscode.Uri) {
    const key = docUri.fsPath;
    // Cancel previous debounce timer
    const existing = debounceTimers.get(key);
    if (existing) {
        clearTimeout(existing);
    }

    debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key);
        // Refresh all webviews watching this document
        for (const entry of activeWebviews) {
            if (entry.docUri.fsPath === key && entry.panel.active && entry.panel.visible) {
                refreshWebview(entry);
            }
        }
    }, DEBOUNCE_MS));
}

export function activate(context: vscode.ExtensionContext) {
    // Listen to file system changes for all files
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidChange(uri => {
        const hasWatchers = activeWebviews.some(e => e.docUri.fsPath === uri.fsPath);
        if (hasWatchers) {
            scheduleRefresh(uri);
        }
    });
    context.subscriptions.push(fileWatcher);

    // Also listen to editor document changes (for in-editor edits)
    const docWatcher = vscode.workspace.onDidChangeTextDocument(event => {
        for (const entry of activeWebviews) {
            if (entry.docUri.fsPath === event.document.uri.fsPath && entry.panel.active && entry.panel.visible) {
                scheduleRefresh(event.document.uri);
                break;
            }
        }
    });
    context.subscriptions.push(docWatcher);

    context.subscriptions.push(
        vscode.commands.registerCommand('json-log-viewer.OpenView', () => {
            let activeTextEditor = vscode.window.activeTextEditor;
            if (activeTextEditor) {
                try {
                    const docUri = activeTextEditor.document.uri;
                    let json = new JSONTable(activeTextEditor.document.getText());

                    const panel = vscode.window.createWebviewPanel(
                        'json-table-viewer',
                        'JSON Log Viewer',
                        vscode.ViewColumn.One,
                        {
                            enableScripts: true,
                        }
                    );
                    panel.webview.html = json.getHTML();

                    const entry: WebviewEntry = { panel, jsonTable: json, docUri };
                    activeWebviews.push(entry);

                    panel.onDidDispose(() => {
                        const idx = activeWebviews.indexOf(entry);
                        if (idx !== -1) { activeWebviews.splice(idx, 1); }
                    });
                } catch (e: any) {
                    vscode.window.showErrorMessage(e.toString());
                }
            } else {
                vscode.window.showErrorMessage("No active text editor found, maybe file is too large.");
            }
        })
    );
}

export function deactivate() { }
