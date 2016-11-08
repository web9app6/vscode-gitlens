'use strict';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { spawnPromise } from 'spawn-rx';
import { Logger } from '../logger';

export * from './gitEnrichment';
export * from './enrichers/blameParserEnricher';
export * from './enrichers/logParserEnricher';

const UncommittedRegex = /^[0]+$/;

async function gitCommand(cwd: string, ...args: any[]) {
    try {
        const s = await spawnPromise('git', args, { cwd: cwd });
        Logger.log('git', ...args, cwd);
        return s;
    }
    catch (ex) {
        const msg = ex && ex.toString();
        if (msg && (msg.includes('is outside repository') || msg.includes('no such path'))) {
            Logger.warn('git', ...args, cwd, msg && msg.replace(/\r?\n|\r/g, ' '));
        } else {
            Logger.error('git', ...args, cwd, msg && msg.replace(/\r?\n|\r/g, ' '));
        }
        throw ex;
    }
}

export type GitBlameFormat = '--incremental' | '--line-porcelain' | '--porcelain';
export const GitBlameFormat = {
    incremental: '--incremental' as GitBlameFormat,
    linePorcelain: '--line-porcelain' as GitBlameFormat,
    porcelain: '--porcelain' as GitBlameFormat
};

export default class Git {
    static normalizePath(fileName: string, repoPath?: string) {
        return fileName.replace(/\\/g, '/');
    }

    static splitPath(fileName: string, repoPath?: string): [string, string] {
        // if (!path.isAbsolute(fileName)) {
        //     Logger.error(`Git.splitPath(${fileName}) is not an absolute path!`);
        //     debugger;
        // }
        if (repoPath) {
            return [fileName.replace(`${repoPath}/`, ''), repoPath];
        } else {
            return [path.basename(fileName).replace(/\\/g, '/'), path.dirname(fileName).replace(/\\/g, '/')];
        }
    }

    static repoPath(cwd: string) {
        return gitCommand(cwd, 'rev-parse', '--show-toplevel').then(data => data.replace(/\r?\n|\r/g, '').replace(/\\/g, '/'));
    }

    static blame(format: GitBlameFormat, fileName: string, sha?: string, repoPath?: string) {
        const [file, root]: [string, string] = Git.splitPath(Git.normalizePath(fileName), repoPath);

        if (sha) {
            return gitCommand(root, 'blame', format, '--root', `${sha}^`, '--', file);
        }
        return gitCommand(root, 'blame', format, '--root', '--', file);
    }

    static blameLines(format: GitBlameFormat, fileName: string, startLine: number, endLine: number, sha?: string, repoPath?: string) {
        const [file, root]: [string, string] = Git.splitPath(Git.normalizePath(fileName), repoPath);

        if (sha) {
            return gitCommand(root, 'blame', `-L ${startLine},${endLine}`, format, '--root', `${sha}^`, '--', file);
        }
        return gitCommand(root, 'blame', `-L ${startLine},${endLine}`, format, '--root', '--', file);
    }

    static log(fileName: string, repoPath?: string) {
        const [file, root]: [string, string] = Git.splitPath(Git.normalizePath(fileName), repoPath);

        return gitCommand(root, 'log', `--follow`, `--name-only`, `--no-merges`, `--format=%H -%nauthor %an%nauthor-date %ai%ncommitter %cn%ncommitter-date %ci%nsummary %s%nfilename -`, file);
    }

    static getVersionedFile(fileName: string, repoPath: string, sha: string) {
        return new Promise<string>((resolve, reject) => {
            Git.getVersionedFileText(fileName, repoPath, sha).then(data => {
                const ext = path.extname(fileName);
                tmp.file({ prefix: `${path.basename(fileName, ext)}-${sha}__`, postfix: ext }, (err, destination, fd, cleanupCallback) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    //Logger.log(`getVersionedFile(${fileName}, ${sha}); destination=${destination}`);
                    fs.appendFile(destination, data, err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(destination);
                    });
                });
            });
        });
    }

    static getVersionedFileText(fileName: string, repoPath: string, sha: string) {
        const [file, root] = Git.splitPath(Git.normalizePath(fileName), repoPath);
        sha = sha.replace('^', '');

        if (Git.isUncommitted(sha)) return new Promise<string>((resolve, reject) => reject(new Error(`sha=${sha} is uncommitted`)));
        return gitCommand(root, 'show', `${sha}:./${file}`);
    }

    static isUncommitted(sha: string) {
        return UncommittedRegex.test(sha);
    }
}