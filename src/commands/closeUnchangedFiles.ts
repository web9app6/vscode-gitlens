'use strict';
import { TextEditor, Uri, window } from 'vscode';
import { ActiveEditorTracker } from '../activeEditorTracker';
import { ActiveEditorCommand, Commands } from './commands';
import { TextEditorComparer, UriComparer } from '../comparers';
import { GitProvider } from '../gitProvider';
import { Logger } from '../logger';
import * as path from 'path';

export class CloseUnchangedFilesCommand extends ActiveEditorCommand {

    constructor(private git: GitProvider, public repoPath: string) {
        super(Commands.CloseUnchangedFiles);
    }

    async execute(editor: TextEditor, uri?: Uri, uris?: Uri[]) {
        if (!(uri instanceof Uri)) {
            uri = editor && editor.document && editor.document.uri;
        }

        try {
            if (!uris) {
                const repoPath = await this.git.getRepoPathFromUri(uri, this.repoPath);
                if (!repoPath) return window.showWarningMessage(`Unable to close unchanged files`);

                const statuses = await this.git.getStatusesForRepo(repoPath);
                if (!statuses) return window.showWarningMessage(`Unable to close unchanged files`);

                uris = statuses.map(_ => Uri.file(path.resolve(repoPath, _.fileName)));
            }

            const editorTracker = new ActiveEditorTracker();

            let active = window.activeTextEditor;
            let editor = active;
            do {
                if (editor) {
                    if ((editor.document && editor.document.isDirty) ||
                        uris.some(_ => UriComparer.equals(_, editor.document && editor.document.uri))) {
                        // If we didn't start with a valid editor, set one once we find it
                        if (!active) {
                            active = editor;
                        }
                        editor = await editorTracker.awaitNext(500);
                    }
                    else {
                        if (active === editor) {
                            active = undefined;
                        }
                        editor = await editorTracker.awaitClose(500);
                    }
                }
                else {
                    if (active === editor) {
                        active = undefined;
                    }
                    editor = await editorTracker.awaitClose(500);
                }
            } while ((!active && !editor) || !TextEditorComparer.equals(active, editor, { useId: true, usePosition: true }));

            editorTracker.dispose();

            return undefined;
        }
        catch (ex) {
            Logger.error('[GitLens.CloseUnchangedFilesCommand]', ex);
            return window.showErrorMessage(`Unable to close unchanged files. See output channel for more details`);
        }
    }
}