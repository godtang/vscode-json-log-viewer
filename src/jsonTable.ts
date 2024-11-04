// 认为单个日志文件中的json对象都一致，只需要解析第一行即可获得整体格式

import * as JSON5 from "json5";
import * as vscode from 'vscode';

class HeaderItem {
    private _attrs: Set<string>;
    private _childs: Map<string, HeaderItem>;
    private _size: number;
    private _level: number;

    constructor(level: number = 0) {
        this._attrs = new Set();
        this._childs = new Map();
        this._size = 0;
        this._level = level;
    }

    get attrs(): Set<string> {
        return this._attrs;
    }

    get children(): Map<string, HeaderItem> {
        return this._childs;
    }

    get size(): number {
        return this._size;
    }

    get level(): number {
        return this._level;
    }

    addAttr(attr: string) {
        this._attrs.add(attr);
    }

    addChild(field: string, child: HeaderItem) {
        child._level = this._level + 1;
        this._childs.set(field, child);
    }

    getOrAddChild(field: string): HeaderItem {
        let ret = this._childs.get(field);
        if (ret) {
            return ret;
        }

        ret = new HeaderItem(this._level + 1);
        this.addChild(field, ret);
        return ret;
    }

    public callSize() {
        this._size = this._attrs.size;
        for (let item of this._childs) {
            item[1].callSize();
            this._size += item[1].size;
        }
    }
}



export class JSONTable {
    private titleJson: object = {};
    private contentList: object[] = [];
    private header: HeaderItem = new HeaderItem();
    private maxHeaderDepth: number = 0;
    private divs: { column: number, row: number, rowSpan: number, data: string; }[] = [];

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
            this.header = new HeaderItem(0);
            this.divs = [];
            this.maxHeaderDepth = this.buildHeader("", this.titleJson, this.header);
            this.header.callSize();
            for (let i = 0; i < this.contentList.length; i++) {
                this.getBodySpan(this.header, this.contentList[i], this.maxHeaderDepth + 1 + i, 1);
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    buildHeader(prefix: string, partialJson: object, partialHeader: HeaderItem): number {
        let ret = 1;
        if (partialJson instanceof Array) {
            let header: HeaderItem = partialHeader.getOrAddChild(prefix + ".*");

            if (partialJson.length === 0) {
                header.addAttr(".value");
            }

            for (let json of partialJson) {
                ret = Math.max(ret, this.buildHeader("", json, header) + 1);
            }
        } else if (partialJson instanceof Object) {
            for (let [k, v] of Object.entries(partialJson)) {
                ret = Math.max(ret, this.buildHeader(prefix + "." + k, v, partialHeader));
            }
        } else if (partialJson) {
            partialHeader.addAttr(prefix + ".value");
        }
        return ret;
    }

    getByPath(path: string, json: any): object | undefined {
        if (!json) {
            return undefined;
        }
        if (path === ".*") {
            if (json instanceof Array) {
                return json;
            }
            return undefined;
        }

        let ret = json;
        let steps = path.split(".");
        for (let step of steps.slice(1, -1)) {
            // console.log(ret, step);
            if (step in ret) {
                ret = ret[step];
                if (!ret) {
                    return ret;
                }
            } else {
                return undefined;
            }
        }

        let step = steps[steps.length - 1];
        if (step === '*' || step === 'value') {
            return ret;
        }

        // console.log(ret, step);
        if (step in ret) {
            ret = ret[step];
            if (!ret) {
                return ret;
            }
        } else {
            return undefined;
        }
        return ret;
    }

    getBodySpan(partialHeader: HeaderItem, partialJson: object, rowBase: number, columnBase: number): number {
        let ret = 1;
        let currentColumnBase = columnBase + partialHeader.attrs.size;
        for (let [k, item] of partialHeader.children.entries()) {
            let childJson = this.getByPath(k, partialJson);
            if (childJson && childJson instanceof Array) {
                let update = 0;
                for (let child of childJson) {
                    update += this.getBodySpan(item, child, rowBase + update, currentColumnBase);
                }
                ret = Math.max(ret, update);
            }
            currentColumnBase += item.size;
        }

        let i = 0;
        for (let attr of partialHeader.attrs) {
            let value = this.getByPath(attr, partialJson);
            if (value) {
                this.divs.push({
                    row: rowBase,
                    column: columnBase + i,
                    rowSpan: ret,
                    data: JSON.stringify(value)
                });
            } else {
                this.divs.push({
                    row: rowBase,
                    column: columnBase + i,
                    rowSpan: ret,
                    data: ""
                });
            }

            ++i;
        }

        return ret;
    }

    tableHeaderHTML(): string {
        let divs: string[] = [];
        let totalRowSpan = this.maxHeaderDepth;
        let q: { index: number, item: HeaderItem; }[] = [{ index: 1, item: this.header }];

        while (q.length > 0) {
            let item = q.shift();
            if (!item) {
                break;
            }

            let header = item.item;
            let index = item.index;
            if (!header) {
                break;
            }

            let rowSpan = totalRowSpan - header.level;

            for (let attr of header.attrs) {
                divs.push(`<div class="table-header table-item" style="grid-column: ${index} / span 1; grid-row: span ${rowSpan};">${attr}</div>`);
                ++index;
            }

            for (let [k, v] of header.children) {
                divs.push(`<div class="table-header table-item" style="grid-column: ${index} / span ${v.size}; grid-row: span 1;">${k}</div>`);
                q.push({ index: index, item: v });
                index += v.size;
            }
        }
        let result = divs.join("");

        return result;
    }

    tableBodyHTML(): string {
        let divStrings: string[] = [];
        for (let div of this.divs) {
            let src_data = div.data;
            src_data = src_data.replace(/\\n/g, '\n');
            divStrings.push(`<div class="table-item" style="grid-column-start: ${div.column}; grid-row: ${div.row} / span ${div.rowSpan};">${src_data}</div>`);
        }
        let result = divStrings.join("");

        return result;
    }

    getHTML(): string {
        return `<!DOCTYPE html>
        <html>
            <header>
                <title>JSON Table Viewer</title>
                <style> 
                    table {
                        width: 100%;
                        border-collapse: collapse; /* 去除双线边框 */
                        overflow-x: auto;
                    }

                    td {
                        border: 1px solid white; /* 单元格边框颜色为白色 */
                        padding: 8px;
                        text-align: left;
                        color: #eee;
                        word-wrap: break-word; /* 允许单词换行 */
                        white-space: pre-wrap;
                    }

                    /* 设置表头粗体 */
                    th {
                        border: 1px solid white; /* 单元格边框颜色为白色 */
                        padding: 8px;
                        text-align: center;
                        color: #fff;
                        font-weight: bold;
                        background-color: #4CAF50; /* 表头背景色（可选） */
                        color: white;
                    }
                </style>
            </header>
            <body>
                <table>
                    ${this.getTitle()}
                    ${this.getContent()}
                </table>
            </body>
        
        </html>`;
    }

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

    getTitle(): string {
        let result = "<tr>";
        for (let key in this.titleJson) {
            let temp = `<th>${key}</th>`;
            result += temp;
        }
        result += "</tr>";
        return result;
    }
    getContent(): string {
        let result = "";
        for (let i = 0; i < this.contentList.length; i++) {
            const content:any = this.contentList[i];
            result += "<tr>";
            for (let key in content) {
                if (typeof content[key] === 'object' && content[key] !== null) {
                    result += `<td>${JSON.stringify(content[key], null, 4)}</td>`;
                  }else{
                    result += `<td>${content[key]}</td>`;
                  }
            }
            result += "</tr>";
        }
        return result;
    }
}

