'use strict';
import { Iterables } from '../system';
import { QuickPickOptions, Uri, window } from 'vscode';
import { Commands } from '../constants';
import { GitCommit, GitUri, IGitLog } from '../gitProvider';
import { CommandQuickPickItem, CommitQuickPickItem, FileQuickPickItem } from './quickPickItems';
import * as moment from 'moment';
import * as path from 'path';

export class CommitQuickPick {

    static async show(commit: GitCommit, workingFileName: string, uri: Uri, currentCommand?: CommandQuickPickItem, goBackCommand?: CommandQuickPickItem, options: { showFileHistory?: boolean } = {}): Promise<CommandQuickPickItem | undefined> {
        const fileName = path.basename(commit.fileName);

        const items: CommandQuickPickItem[] = [
            new CommandQuickPickItem({
                label: `$(diff) Compare with Working Tree`,
                description: `$(git-commit) ${commit.sha} \u00a0 $(git-compare) \u00a0 $(file-text) ${workingFileName || commit.fileName}`
            }, Commands.DiffWithWorking, [uri, commit])
        ];

        if (commit.previousSha) {
            items.push(new CommandQuickPickItem({
                label: `$(diff) Compare with Previous Commit`,
                description: `$(git-commit) ${commit.previousSha} \u00a0 $(git-compare) \u00a0 $(git-commit) ${commit.sha}`
            }, Commands.DiffWithPrevious, [commit.uri, commit]));
        }

        if (options.showFileHistory) {
            items.push(new CommandQuickPickItem({
                label: `$(versions) Show History of ${fileName}`,
                description: `\u2022 since $(git-commit) ${commit.sha}`
            }, Commands.ShowQuickFileHistory, [new GitUri(commit.uri, commit), undefined, currentCommand]));

            if (workingFileName) {
                items.push(new CommandQuickPickItem({
                    label: `$(versions) Show Full History of ${fileName}`,
                    description: null
                }, Commands.ShowQuickFileHistory, [commit.uri, undefined, currentCommand]));
            }
        }

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        return await window.showQuickPick(items, {
            matchOnDescription: true,
            placeHolder: `${commit.fileName} \u2022 ${commit.sha} \u2022 ${commit.author}, ${moment(commit.date).fromNow()} \u2022 ${commit.message}`
        } as QuickPickOptions);
    }
}

export class CommitFilesQuickPick {

    static async show(commit: GitCommit, uri: Uri, goBackCommand?: CommandQuickPickItem): Promise<FileQuickPickItem | CommandQuickPickItem | undefined> {
        const items: (FileQuickPickItem | CommandQuickPickItem)[] = commit.fileName
            .split(', ')
            .filter(_ => !!_)
            .map(f => new FileQuickPickItem(commit, f));

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        return await window.showQuickPick(items, {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: `${commit.sha} \u2022 ${commit.author}, ${moment(commit.date).fromNow()} \u2022 ${commit.message}`
        } as QuickPickOptions);
    }
}

export class FileCommitsQuickPick {

    static async show(log: IGitLog, uri: Uri, maxCount: number, defaultMaxCount: number, goBackCommand?: CommandQuickPickItem): Promise<CommitQuickPickItem | CommandQuickPickItem | undefined> {
        const items = Array.from(Iterables.map(log.commits.values(), c => new CommitQuickPickItem(c))) as (CommitQuickPickItem | CommandQuickPickItem)[];

        // Only show the full repo option if we are the root
        if (!goBackCommand) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(repo) Show Repository History`,
                description: null
            }, Commands.ShowQuickRepoHistory, [undefined, undefined, undefined, new CommandQuickPickItem({
                label: `go back \u21A9`,
                description: null
            }, Commands.ShowQuickFileHistory, [uri, maxCount])]));
        }

        if (maxCount !== 0 && items.length === defaultMaxCount) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(sync) Show Full History`,
                description: `\u2014 Currently only showing the first ${defaultMaxCount} commits`,
                detail: `This may take a while`
            }, Commands.ShowQuickFileHistory, [uri, 0, goBackCommand]));
        }

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        return await window.showQuickPick(items, {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: `${Iterables.first(log.commits.values()).fileName}`
        } as QuickPickOptions);
    }
}

export class RepoCommitsQuickPick {

    static async show(log: IGitLog, uri: Uri, maxCount: number, defaultMaxCount: number, goBackCommand?: CommandQuickPickItem): Promise<CommitQuickPickItem | CommandQuickPickItem | undefined> {
        const items = Array.from(Iterables.map(log.commits.values(), c => new CommitQuickPickItem(c, ` \u2014 ${c.fileName}`))) as (CommitQuickPickItem | CommandQuickPickItem)[];
        if (maxCount !== 0 && items.length === defaultMaxCount) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(sync) Show Full History`,
                description: `\u2014 Currently only showing the first ${defaultMaxCount} commits`,
                detail: `This may take a while`
            }, Commands.ShowQuickRepoHistory, [uri, 0, undefined, goBackCommand]));
        }

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        return await window.showQuickPick(items, {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: 'Search by commit message, filename, or sha'
        } as QuickPickOptions);
    }
}