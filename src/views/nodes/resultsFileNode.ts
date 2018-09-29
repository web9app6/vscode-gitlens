'use strict';
import * as path from 'path';
import { Command, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Commands, DiffWithCommandArgs } from '../../commands';
import { Container } from '../../container';
import { GitFile, GitUri, IStatusFormatOptions, StatusFileFormatter } from '../../git/gitService';
import { Explorer } from '../explorer';
import { ExplorerNode, ResourceType } from './explorerNode';

export class ResultsFileNode extends ExplorerNode {
    constructor(
        public readonly repoPath: string,
        public readonly file: GitFile,
        public readonly ref1: string,
        public readonly ref2: string,
        parent: ExplorerNode,
        public readonly explorer: Explorer
    ) {
        super(GitUri.fromFile(file, repoPath, ref1 ? ref1 : ref2 ? ref2 : undefined), parent);
    }

    getChildren(): ExplorerNode[] {
        return [];
    }

    getTreeItem(): TreeItem {
        const item = new TreeItem(this.label, TreeItemCollapsibleState.None);
        item.contextValue = ResourceType.ResultsFile;
        item.tooltip = StatusFileFormatter.fromTemplate('${file}\n${directory}/\n\n${status}', this.file);

        const statusIcon = GitFile.getStatusIcon(this.file.status);
        item.iconPath = {
            dark: Container.context.asAbsolutePath(path.join('images', 'dark', statusIcon)),
            light: Container.context.asAbsolutePath(path.join('images', 'light', statusIcon))
        };

        item.command = this.getCommand();
        return item;
    }

    private _folderName: string | undefined;
    get folderName() {
        if (this._folderName === undefined) {
            this._folderName = path.dirname(this.uri.getRelativePath());
        }
        return this._folderName;
    }

    private _label: string | undefined;
    get label() {
        if (this._label === undefined) {
            this._label = StatusFileFormatter.fromTemplate('${filePath}', this.file, {
                relativePath: this.relativePath
            } as IStatusFormatOptions);
        }
        return this._label;
    }

    private _relativePath: string | undefined;
    get relativePath(): string | undefined {
        return this._relativePath;
    }
    set relativePath(value: string | undefined) {
        this._relativePath = value;
        this._label = undefined;
    }

    get priority(): number {
        return 0;
    }

    getCommand(): Command | undefined {
        return {
            title: 'Open Changes',
            command: Commands.DiffWith,
            arguments: [
                this.uri,
                {
                    lhs: {
                        sha: this.ref1,
                        uri: this.uri
                    },
                    rhs: {
                        sha: this.ref2,
                        uri:
                            this.file.status === 'R'
                                ? GitUri.fromFile(this.file, this.uri.repoPath!, this.ref2, true)
                                : this.uri
                    },
                    repoPath: this.uri.repoPath!,

                    line: 0,
                    showOptions: {
                        preserveFocus: true,
                        preview: true
                    }
                } as DiffWithCommandArgs
            ]
        };
    }
}
