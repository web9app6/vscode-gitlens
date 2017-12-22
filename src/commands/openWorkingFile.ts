'use strict';
import { Range, TextDocumentShowOptions, TextEditor, Uri, window } from 'vscode';
import { AnnotationController, FileAnnotationType } from '../annotations/annotationController';
import { ActiveEditorCommand, Commands, getCommandUri, openEditor } from './common';
import { GitService, GitUri } from '../gitService';
import { Logger } from '../logger';

export interface OpenWorkingFileCommandArgs {
    uri?: Uri;
    line?: number;
    showOptions?: TextDocumentShowOptions;
    annotationType?: FileAnnotationType;
}

export class OpenWorkingFileCommand extends ActiveEditorCommand {

    constructor(
        private readonly annotationController: AnnotationController,
        private readonly git: GitService
    ) {
        super(Commands.OpenWorkingFile);
    }

    async execute(editor: TextEditor, uri?: Uri, args: OpenWorkingFileCommandArgs = {}) {
        args = { ...args };
        if (args.line === undefined) {
            args.line = editor === undefined ? 0 : editor.selection.active.line;
        }

        try {
            if (args.uri === undefined) {
                uri = getCommandUri(uri, editor);
                if (uri === undefined) return undefined;

                args.uri = await GitUri.fromUri(uri, this.git);
            }

            if (args.line !== undefined && args.line !== 0) {
                if (args.showOptions === undefined) {
                    args.showOptions = {};
                }
                args.showOptions.selection = new Range(args.line, 0, args.line, 0);
            }

            const e = await openEditor(args.uri, { ...args.showOptions, rethrow: true });
            if (args.annotationType === undefined) return e;

            return this.annotationController.showAnnotations(e!, args.annotationType, args.line);
        }
        catch (ex) {
            Logger.error(ex, 'OpenWorkingFileCommand');
            return window.showErrorMessage(`Unable to open working file. See output channel for more details`);
        }
    }
}