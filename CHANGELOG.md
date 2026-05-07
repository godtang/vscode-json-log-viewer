# Change Log

## 1.0.5

- Optimize tail mode: only append new lines via `postMessage`, no full page re-render
- Remember file byte offset, read only new content from disk

## 1.0.4

- Auto-scroll to bottom on initial render and on file change
- Add visible Ctrl+F 搜索 button for search bar (webview keyboard shortcut intercepted by VS Code)
- Add `format-embedded-json` configuration option

## 1.0.3

- Add log level filtering (`log-level-field`, `log-level-filter`)
- Add max lines limit (`max-lines`, default 1000)
- Add batch rendering (`batch-size`, default 100)
- Add embedded JSON auto-formatting (`format-embedded-json`)
- Add Ctrl+F search bar with case-sensitive and whole-word options
- Add HTML escaping for table cell content

## 1.0.2

- Add `show-fields` configuration to filter displayed columns
- Implement file change watching for live tail refresh
- Add `createFileSystemWatcher` for external file writes

## 1.0.1

- Add HTML file for debugging
- Add error handling for large files
- Add column resize and right-click hide

## 1.0.0

- Initial release: open webview table for current JSON file
