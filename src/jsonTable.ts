import * as JSON5 from "json5";
import * as vscode from 'vscode';

const logLevelEnum: Record<string, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
    DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3
};

export class JSONTable {
    private fields: string[] = [];
    private contentList: any[] = [];
    private batchSize: number = 100;

    constructor(text: string) {
        this.refresh(text);
    }

    refresh(text: string): void {
        try {
            const conf = vscode.workspace.getConfiguration("json-table-viewer");
            const showFields = conf.get<string[]>("show-fields", []);
            const levelField = conf.get<string>("log-level-field", "");
            const levelFilter = conf.get<string>("log-level-filter", "debug");
            const maxLines = conf.get<number>("max-lines", 1000);
            this.batchSize = conf.get<number>("batch-size", 100);

            const lines = text.trim().split("\n");
            this.contentList = [];

            const minLevel = logLevelEnum[levelFilter] ?? 0;

            for (let i = 0; i < lines.length; i++) {
                let tempStr = lines[i].trim();
                if ("" === tempStr) {
                    continue;
                }
                let tempJson = JSON5.parse(tempStr);

                // 日志级别过滤
                if (levelField && tempJson[levelField] !== undefined) {
                    const levelValue = logLevelEnum[tempJson[levelField]];
                    if (levelValue === undefined || levelValue < minLevel) {
                        continue;
                    }
                }

                this.contentList.push(tempJson);
            }

            // 最大行数限制
            if (this.contentList.length > maxLines) {
                this.contentList = this.contentList.slice(-maxLines);
            }

            // 字段列表
            const allFields = lines.length > 0 ? Object.keys(JSON5.parse(lines[0])) : [];
            this.fields = showFields.length > 0
                ? showFields.filter(f => allFields.includes(f))
                : allFields;
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    getHTML(): string {
        return `<!DOCTYPE html>
        <html>
            <header>
                <title>JSON Table Viewer</title>
                <style>
                    ${this.getStyle()}
                </style>
            </header>
            <body>
                <div id="searchBar" style="position:fixed; top:0; left:0; right:0; background:#2d2d2d; padding:8px; z-index:9999; border-bottom:1px solid #555;">
                    <input id="searchInput" type="text" placeholder="Search (Enter=下一个, Shift+Enter=上一个)" style="flex:1; padding:4px 8px; background:#1e1e1e; color:#eee; border:1px solid #555; border-radius:3px; font-size:14px; outline:none;" />
                    <label style="color:#ccc; font-size:13px; cursor:pointer; white-space:nowrap;">
                        <input id="caseSensitive" type="checkbox" style="vertical-align:middle; margin-right:3px;" /> 区分大小写
                    </label>
                    <label style="color:#ccc; font-size:13px; cursor:pointer; white-space:nowrap;">
                        <input id="wholeWord" type="checkbox" style="vertical-align:middle; margin-right:3px;" /> 全词匹配
                    </label>
                    <span id="searchCount" style="color:#aaa; font-size:13px; min-width:60px; text-align:right;"></span>
                    <button onclick="closeSearch()" style="background:transparent; color:#ccc; border:none; font-size:18px; cursor:pointer; padding:0 6px;">&times;</button>
                </div>
                <button id="searchToggle" onclick="showSearchBar()" style="position:fixed; top:8px; right:8px; z-index:10000; background:#007acc; color:#fff; border:none; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">Ctrl+F 搜索</button>
                <div id="contentWrapper" style="padding-top:0px;">
                <table id="table">
                    <thead id="tableHead"></thead>
                    <tbody id="tableBody"></tbody>
                </table>
                <div id="contextMenu" class="context-menu">
                    <div class="context-menu-item" id="hideColumn">Hide this column</div>
                </div>
                </div>
                <script>
                    var __DATA__ = ${JSON.stringify({ fields: this.fields, rows: this.contentList })};
                    var __BATCH_SIZE__ = ${this.batchSize};
                    var __FORMAT_JSON__ = ${vscode.workspace.getConfiguration("json-table-viewer").get<boolean>("format-embedded-json", true)};
                </script>
                ${this.getScript()}
            </body>
        </html>`;
    }

    getStyle(): string {
        return `
        table {
            width: 100%;
            border-collapse: collapse;
            overflow-x: auto;
        }
        th {
            border: 1px solid white;
            padding: 8px;
            text-align: center;
            color: #fff;
            font-weight: bold;
            background-color: #4CAF50;
            color: white;
            position: relative;
        }
        th .resizer {
            position: absolute;
            top: 0;
            right: 0;
            width: 5px;
            height: 100%;
            cursor: col-resize;
            user-select: none;
        }
        td {
            border: 1px solid white;
            padding: 8px;
            text-align: left;
            color: #eee;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-family: Consolas, monospace;
            position: relative;
        }
        .context-menu {
            display: none;
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        .context-menu-item {
            padding: 8px 12px;
            cursor: pointer;
        }
        .context-menu-item:hover {
            background: #f0f0f0;
        }
        .highlight {
            background-color: yellow;
            color: black;
        }
        `;
    }

    getScript(): string {
        return `
        <script>
            // ===== Search =====
            function closeSearch() {
                var sb = document.getElementById('searchBar');
                sb.style.display = 'none';
                document.getElementById('contentWrapper').style.paddingTop = '0px';
                document.getElementById('searchToggle').style.display = 'block';
            }

            function showSearchBar() {
                var sb = document.getElementById('searchBar');
                sb.style.display = 'flex';
                sb.style.alignItems = 'center';
                sb.style.gap = '8px';
                document.getElementById('contentWrapper').style.paddingTop = '42px';
                document.getElementById('searchToggle').style.display = 'none';
                document.getElementById('searchInput').focus();
                document.getElementById('searchInput').select();
            }

            function doSearch(forward) {
                var input = document.getElementById('searchInput');
                var str = input.value;
                if (!str) {
                    document.getElementById('searchCount').textContent = '';
                    return;
                }
                var caseSensitive = document.getElementById('caseSensitive').checked;
                var wholeWord = document.getElementById('wholeWord').checked;

                var opts = {
                    forward: forward !== false,
                    caseSensitive: caseSensitive,
                    findNext: true
                };
                if (wholeWord) {
                    opts.wordStart = true;
                    opts.wordEnd = true;
                }

                var found = window.find(str, caseSensitive, !opts.forward, opts.wordStart || false, false, false, false);
                if (found) {
                    document.getElementById('searchCount').textContent = '已找到';
                } else {
                    document.getElementById('searchCount').textContent = '未找到';
                }
            }

            function initSearch() {
                var searchBar = document.getElementById('searchBar');
                searchBar.style.display = 'none';
                var searchInput = document.getElementById('searchInput');
                var caseCheck = document.getElementById('caseSensitive');
                var wordCheck = document.getElementById('wholeWord');

                document.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                        e.preventDefault();
                        e.stopPropagation();
                        showSearchBar();
                    }
                    if (e.key === 'Escape') {
                        closeSearch();
                    }
                });

                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        doSearch(!e.shiftKey);
                    }
                });

                caseCheck.addEventListener('change', function() { doSearch(true); });
                wordCheck.addEventListener('change', function() { doSearch(true); });
            }
            function formatEmbeddedJson(str) {
                if (typeof str !== 'string') return str;
                var jsonStart = str.indexOf('{');
                var jsonEnd = str.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    var jsonStr = str.substring(jsonStart, jsonEnd + 1);
                    try {
                        var jsonObj = JSON.parse(jsonStr);
                        return str.substring(0, jsonStart) + JSON.stringify(jsonObj, null, '\\t') + str.substring(jsonEnd + 1);
                    } catch (e) {}
                }
                var arrayStart = str.indexOf('[');
                var arrayEnd = str.lastIndexOf(']');
                if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
                    var arrayStr = str.substring(arrayStart, arrayEnd + 1);
                    try {
                        var jsonArray = JSON.parse(arrayStr);
                        return str.substring(0, arrayStart) + JSON.stringify(jsonArray, null, '\\t') + str.substring(jsonEnd + 1);
                    } catch (e) {}
                }
                return str;
            }

            function escapeHtml(str) {
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            function formatCellValue(value) {
                if (value === null || value === undefined) return '';
                if (typeof value === 'object') return JSON.stringify(value, null, 4);
                var str = String(value);
                if (__FORMAT_JSON__) {
                    str = formatEmbeddedJson(str);
                }
                return escapeHtml(str);
            }

            function renderTable() {
                var fields = __DATA__.fields;
                var rows = __DATA__.rows;
                var batchSize = __BATCH_SIZE__;

                // Render header
                var thead = document.getElementById('tableHead');
                var headerRow = document.createElement('tr');
                fields.forEach(function(field) {
                    var th = document.createElement('th');
                    th.innerHTML = escapeHtml(field) + '<div class="resizer"></div>';
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Batch render body
                var tbody = document.getElementById('tableBody');
                var totalRows = rows.length;
                var currentRow = 0;

                function renderBatch() {
                    var fragment = document.createDocumentFragment();
                    var end = Math.min(currentRow + batchSize, totalRows);

                    for (var i = currentRow; i < end; i++) {
                        var content = rows[i];
                        var tr = document.createElement('tr');
                        fields.forEach(function(key) {
                            var td = document.createElement('td');
                            td.innerHTML = formatCellValue(content[key]);
                            tr.appendChild(td);
                        });
                        fragment.appendChild(tr);
                    }

                    tbody.appendChild(fragment);
                    currentRow = end;

                    if (currentRow < totalRows) {
                        setTimeout(renderBatch, 0);
                    }
                }

                renderBatch();

                // Setup resizers
                var resizers = document.querySelectorAll('.resizer');
                resizers.forEach(function(resizer) {
                    resizer.addEventListener('mousedown', function(e) {
                        var startX = e.pageX;
                        var startWidth = resizer.parentElement.offsetWidth;
                        var isDragging = true;
                        function onMouseMove(e) {
                            if (!isDragging) return;
                            resizer.parentElement.style.width = (startWidth + (e.pageX - startX)) + 'px';
                        }
                        function onMouseUp() {
                            isDragging = false;
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        }
                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    });
                });

                // Context menu
                var table = document.getElementById('table');
                var tableHead = document.getElementById('tableHead');
                var contextMenu = document.getElementById('contextMenu');
                var currentColumnIndex = null;

                tableHead.addEventListener('contextmenu', function(event) {
                    event.preventDefault();
                    var th = event.target.closest('th');
                    if (th) {
                        currentColumnIndex = [...th.parentElement.children].indexOf(th);
                        contextMenu.style.left = event.pageX + 'px';
                        contextMenu.style.top = event.pageY + 'px';
                        contextMenu.style.display = 'block';
                    }
                });

                document.addEventListener('click', function() {
                    contextMenu.style.display = 'none';
                });

                document.getElementById('hideColumn').addEventListener('click', function() {
                    if (currentColumnIndex !== null) {
                        table.querySelectorAll('thead th')[currentColumnIndex].style.display = 'none';
                        table.querySelectorAll('tbody tr').forEach(function(row) {
                            row.children[currentColumnIndex].style.display = 'none';
                        });
                    }
                    contextMenu.style.display = 'none';
                });
            }

            renderTable();
            initSearch();
        </script>
        `;
    }
}
