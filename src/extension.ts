import * as vscode from 'vscode';
import { JSONTable } from './jsonTable';

interface WebviewEntry {
    panel: vscode.WebviewPanel;
    jsonTable: JSONTable;
    docUri: vscode.Uri;
}

const activeWebviews: WebviewEntry[] = [];

const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

function scheduleRefresh(docUri: vscode.Uri) {
    const key = docUri.fsPath;
    const existing = debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }

    debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key);
        for (const entry of activeWebviews) {
            if (entry.docUri.fsPath === key && entry.panel.active && entry.panel.visible) {
                entry.jsonTable.appendNewLines(entry.panel, key);
            }
        }
    }, DEBOUNCE_MS));
}

export function activate(context: vscode.ExtensionContext) {
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidChange(uri => {
        if (activeWebviews.some(e => e.docUri.fsPath === uri.fsPath)) {
            scheduleRefresh(uri);
        }
    });
    context.subscriptions.push(fileWatcher);

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
                    const json = new JSONTable(activeTextEditor.document.getText());

                    const panel = vscode.window.createWebviewPanel(
                        'json-table-viewer',
                        'JSON Log Viewer',
                        vscode.ViewColumn.One,
                        { enableScripts: true }
                    );
                    panel.webview.html = json.getHTML();

                    json.byteOffset = activeTextEditor.document.getText().length;

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
