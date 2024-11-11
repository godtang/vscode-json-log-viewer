// 认为单个日志文件中的json对象都一致，只需要解析第一行即可获得整体格式

import * as JSON5 from "json5";
import * as vscode from 'vscode';



export class JSONTable {
    private titleJson: object = {};
    private contentList: object[] = [];

    constructor(text: string) {
        try {
            const lines = text.trim().split("\n");
            this.contentList = [];
            for (let i = 0; i < lines.length; i++) {
                let tempStr = lines[i].trim();
                if ("" === tempStr) {
                    continue;
                }
                let tempJson = JSON5.parse(tempStr);
                this.contentList.push(tempJson);
            }
            this.titleJson = JSON5.parse(lines[0]);
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
                <table>
                    ${this.getTitle()}
                    ${this.getContent()}
                </table>
                ${this.getScript()}
            </body>
        </html>`;
    }

    getStyle(): string {
        return `
        table {
            width: 100%;
            border-collapse: collapse; /* 去除双线边框 */
            overflow-x: auto;
        }
        th {
            border: 1px solid white; /* 单元格边框颜色为白色 */
            padding: 8px;
            text-align: center;
            color: #fff;
            font-weight: bold;
            background-color: #4CAF50; /* 表头背景色（可选） */
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
            border: 1px solid white; /* 单元格边框颜色为白色 */
            padding: 8px;
            text-align: left;
            color: #eee;
            word-wrap: break-word; /* 允许单词换行 */
            white-space: pre-wrap;
            font-family: Consolas, monospace;
            position: relative;
        }
        `;
    }

    getTitle(): string {
        let result = "<tr>";
        for (let key in this.titleJson) {
            let temp = `<th>${key}<div class="resizer"></div></th>`;
            result += temp;
        }
        result += "</tr>";
        return result;
    }
    getContent(): string {
        let result = "";
        for (let i = 0; i < this.contentList.length; i++) {
            const content: any = this.contentList[i];
            result += "<tr>";
            for (let key in content) {
                if (typeof content[key] === 'object' && content[key] !== null) {
                    result += `<td>${JSON.stringify(content[key], null, 4)}</td>`;
                } else {
                    result += `<td>${content[key]}</td>`;
                }
            }
            result += "</tr>";
        }
        return result;
    }

    // 后续可以考虑支持自定义样式
    getTableItemStyle(type: string): string {
        const conf = vscode.workspace.getConfiguration("json-table-viewer");
        if (conf) {
            const style = conf.get<string>(type);
            if (style) {
                return style;
            }
        }
        return 'text-align: left;';
    }

    getScript(): string {
        return `
        <script>
            const resizers = document.querySelectorAll(".resizer");
            let startX, startWidth;
            let isDragging = false;

            resizers.forEach(resizer => {
                resizer.addEventListener("mousedown", (e) => {
                startX = e.pageX;
                startWidth = resizer.parentElement.offsetWidth;
                isDragging = true;
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
                });

                function onMouseMove(e) {
                if (!isDragging) return;
                const newWidth = startWidth + (e.pageX - startX);
                resizer.parentElement.style.width = newWidth + "px";
                }

                function onMouseUp() {
                isDragging = false;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                }
            });
        </script>
        `;
    }
}

