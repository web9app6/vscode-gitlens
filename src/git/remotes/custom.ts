'use strict';
import { Strings } from '../../system';
import { Range } from 'vscode';
import { IRemotesConfig } from '../../configuration';
import { RemoteProvider } from './provider';

export class CustomService extends RemoteProvider {

    constructor(domain: string, path: string, private readonly config: IRemotesConfig) {
        super(domain, path, config.name, true);
    }

    get name() {
        return this.formatName('Custom');
    }

    protected getUrlForRepository(): string {
        return Strings.interpolate(this.config.custom!.repository, { repo: this.path });
    }

    protected getUrlForBranches(): string {
        return Strings.interpolate(this.config.custom!.branches, { repo: this.path });
    }

    protected getUrlForBranch(branch: string): string {
        return Strings.interpolate(this.config.custom!.branch, { repo: this.path, branch: branch });
    }

    protected getUrlForCommit(sha: string): string {
        return Strings.interpolate(this.config.custom!.commit, { repo: this.path, id: sha });
    }

    protected getUrlForFile(fileName: string, branch?: string, sha?: string, range?: Range): string {
        let line = '';
        if (range) {
            if (range.start.line === range.end.line) {
                line = Strings.interpolate(this.config.custom!.fileLine, { line: range.start.line });
            }
            else {
                line = Strings.interpolate(this.config.custom!.fileRange, { start: range.start.line, end: range.end.line });
            }
        }

        if (sha) return Strings.interpolate(this.config.custom!.fileInCommit, { repo: this.path, id: sha, file: fileName, line: line });
        if (branch) return Strings.interpolate(this.config.custom!.fileInBranch, { repo: this.path, branch: branch, file: fileName, line: line });
        return Strings.interpolate(this.config.custom!.file, { repo: this.path, file: fileName, line: line });
    }
}