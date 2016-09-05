'use strict'
import {commands, DecorationOptions, Disposable, OverviewRulerLane, Position, Range, TextEditor, TextEditorEdit, TextEditorDecorationType, Uri, window} from 'vscode';
import {Commands, VsCodeCommands} from './constants';
import GitProvider from './gitProvider';
import GitBlameController from './gitBlameController';
import {basename} from 'path';
import * as moment from 'moment';

abstract class Command extends Disposable {
    private _subscriptions: Disposable;

    constructor(command: Commands) {
        super(() => this.dispose());
        this._subscriptions = commands.registerCommand(command, this.execute, this);
    }

    dispose() {
        this._subscriptions && this._subscriptions.dispose();
    }

    abstract execute(...args): any;
}

abstract class EditorCommand extends Disposable {
    private _subscriptions: Disposable;

    constructor(command: Commands) {
        super(() => this.dispose());
        this._subscriptions = commands.registerTextEditorCommand(command, this.execute, this);
    }

    dispose() {
        this._subscriptions && this._subscriptions.dispose();
    }

    abstract execute(editor: TextEditor, edit: TextEditorEdit, ...args): any;
}

export class ShowBlameCommand extends EditorCommand {
    constructor(private git: GitProvider, private blameController: GitBlameController) {
        super(Commands.ShowBlame);
    }

    execute(editor: TextEditor, edit: TextEditorEdit, uri?: Uri, sha?: string) {
        if (sha) {
            return this.blameController.toggleBlame(editor, sha);
        }

        const activeLine = editor.selection.active.line;
        return this.git.getBlameForLine(editor.document.fileName, activeLine)
            .then(blame => this.blameController.showBlame(editor, blame.commit.sha));
    }
}

export class ToggleBlameCommand extends EditorCommand {
    constructor(private git: GitProvider, private blameController: GitBlameController) {
        super(Commands.ToggleBlame);
    }

    execute(editor: TextEditor, edit: TextEditorEdit, uri?: Uri, sha?: string) {
        if (sha) {
            return this.blameController.toggleBlame(editor, sha);
        }

        const activeLine = editor.selection.active.line;
        return this.git.getBlameForLine(editor.document.fileName, activeLine)
            .then(blame => this.blameController.toggleBlame(editor, blame.commit.sha));
    }
}

export class ShowHistoryCommand extends EditorCommand {
    constructor(private git: GitProvider) {
        super(Commands.ShowHistory);
    }

    execute(editor: TextEditor, edit: TextEditorEdit, uri?: Uri, range?: Range, position?: Position) {
        // If the command is executed manually -- treat it as a click on the root lens (i.e. show blame for the whole file)
        if (!uri) {
            const doc = editor.document;
            if (doc) {
                uri = doc.uri;
                range = doc.validateRange(new Range(0, 0, 1000000, 1000000));
                position = doc.validateRange(new Range(0, 0, 0, 1000000)).start;
            }

            if (!uri) return;
        }

        return this.git.getBlameLocations(uri.path, range).then(locations => {
            return commands.executeCommand(VsCodeCommands.ShowReferences, uri, position, locations);
        });
    }
}

export class DiffWithPreviousCommand extends EditorCommand {
    constructor(private git: GitProvider) {
        super(Commands.DiffWithPrevious);
    }

    execute(editor: TextEditor, edit: TextEditorEdit, uri?: Uri, sha?: string, compareWithSha?: string) {
        if (!sha) {
            return this.git.getBlameForLine(uri.path, editor.selection.active.line)
                .then(blame => commands.executeCommand(Commands.DiffWithPrevious, uri, blame.commit.sha, blame.commit.previousSha));
        }

        if (!compareWithSha) {
            return window.showInformationMessage(`Commit ${sha} has no previous commit`);
        }

        return Promise.all([this.git.getVersionedFile(uri.path, sha), this.git.getVersionedFile(uri.path, compareWithSha)])
            .then(values => {
                const [source, compare] = values;
                const fileName = basename(uri.path);
                return commands.executeCommand(VsCodeCommands.Diff, Uri.file(compare), Uri.file(source), `${fileName} (${compareWithSha}) ↔ ${fileName} (${sha})`);
            });
    }
}

export class DiffWithWorkingCommand extends EditorCommand {
    constructor(private git: GitProvider) {
        super(Commands.DiffWithWorking);
    }

    execute(editor: TextEditor, edit: TextEditorEdit, uri?: Uri, sha?: string) {
        if (!sha) {
            return this.git.getBlameForLine(uri.path, editor.selection.active.line)
                .then(blame => commands.executeCommand(Commands.DiffWithWorking, uri, blame.commit.sha));
        };

        return this.git.getVersionedFile(uri.path, sha).then(compare => {
            const fileName = basename(uri.path);
            return commands.executeCommand(VsCodeCommands.Diff, Uri.file(compare), uri, `${fileName} (${sha}) ↔ ${fileName} (index)`);
        });
    }
}