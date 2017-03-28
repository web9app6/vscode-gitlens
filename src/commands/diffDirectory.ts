'use strict';
import { Iterables } from '../system';
import { TextEditor, Uri, window } from 'vscode';
import { ActiveEditorCommand, Commands } from './common';
import { GitService } from '../gitService';
import { Logger } from '../logger';
import { CommandQuickPickItem, BranchesQuickPick } from '../quickPicks';

export class DiffDirectoryCommand extends ActiveEditorCommand {

    constructor(private git: GitService, private repoPath: string) {
        super(Commands.DiffDirectory);
    }

    async execute(editor: TextEditor, uri?: Uri, shaOrBranch1?: string, shaOrBranch2?: string): Promise<any> {
        if (!(uri instanceof Uri)) {
            uri = editor && editor.document && editor.document.uri;
        }

        try {
            const repoPath = await this.git.getRepoPathFromUri(uri, this.repoPath);
            if (!repoPath) return window.showWarningMessage(`Unable to open directory diff`);

            if (!shaOrBranch1) {
                const branches = await this.git.getBranches(repoPath);
                const current = Iterables.find(branches, _ => _.current);

                const pick = await BranchesQuickPick.show(branches, `Compare ${current.name} to \u2026`);
                if (!pick) return undefined;

                if (pick instanceof CommandQuickPickItem) {
                    return pick.execute();
                }

                shaOrBranch1 = pick.branch.name;
                if (!shaOrBranch1) return undefined;
            }

            this.git.openDirectoryDiff(repoPath, shaOrBranch1, shaOrBranch2);
            return undefined;
        }
        catch (ex) {
            Logger.error(ex, 'DiffDirectoryCommand');
            return window.showErrorMessage(`Unable to open directory diff. See output channel for more details`);
        }
    }
}