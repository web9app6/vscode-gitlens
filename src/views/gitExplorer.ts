'use strict';
import { Functions, Objects } from '../system';
import { commands, Disposable, Event, EventEmitter, ExtensionContext, TextDocumentShowOptions, TextEditor, TreeDataProvider, TreeItem, Uri, window, workspace } from 'vscode';
import { Commands, DiffWithCommandArgs, DiffWithCommandArgsRevision, DiffWithPreviousCommandArgs, DiffWithWorkingCommandArgs, openEditor, OpenFileInRemoteCommandArgs } from '../commands';
import { UriComparer } from '../comparers';
import { ExtensionKey, GitExplorerFilesLayout, IConfig } from '../configuration';
import { CommandContext, GlyphChars, setCommandContext, WorkspaceState } from '../constants';
import { BranchHistoryNode, CommitFileNode, CommitNode, ExplorerNode, HistoryNode, MessageNode, RepositoriesNode, RepositoryNode, StashNode } from './explorerNodes';
import { GitService, GitUri, RepoChangedReasons } from '../gitService';

export * from './explorerNodes';

export enum GitExplorerView {
    Auto = 'auto',
    History = 'history',
    Repository = 'repository'
}

export interface OpenFileRevisionCommandArgs {
    uri?: Uri;
    showOptions?: TextDocumentShowOptions;
}

export interface RefreshNodeCommandArgs {
    maxCount?: number;
}

export class GitExplorer implements TreeDataProvider<ExplorerNode> {

    private _config: IConfig;
    private _root?: ExplorerNode;
    private _view: GitExplorerView | undefined;

    private _onDidChangeTreeData = new EventEmitter<ExplorerNode>();
    public get onDidChangeTreeData(): Event<ExplorerNode> {
        return this._onDidChangeTreeData.event;
    }

    constructor(private readonly context: ExtensionContext, private readonly git: GitService) {
        commands.registerCommand('gitlens.gitExplorer.setAutoRefreshToOn', () => this.setAutoRefresh(this.git.config.gitExplorer.autoRefresh, true), this);
        commands.registerCommand('gitlens.gitExplorer.setAutoRefreshToOff', () => this.setAutoRefresh(this.git.config.gitExplorer.autoRefresh, true), this);
        commands.registerCommand('gitlens.gitExplorer.setFilesLayoutToAuto', () => this.setFilesLayout(GitExplorerFilesLayout.Auto), this);
        commands.registerCommand('gitlens.gitExplorer.setFilesLayoutToList', () => this.setFilesLayout(GitExplorerFilesLayout.List), this);
        commands.registerCommand('gitlens.gitExplorer.setFilesLayoutToTree', () => this.setFilesLayout(GitExplorerFilesLayout.Tree), this);
        commands.registerCommand('gitlens.gitExplorer.switchToHistoryView', () => this.switchTo(GitExplorerView.History), this);
        commands.registerCommand('gitlens.gitExplorer.switchToRepositoryView', () => this.switchTo(GitExplorerView.Repository), this);
        commands.registerCommand('gitlens.gitExplorer.refresh', this.refresh, this);
        commands.registerCommand('gitlens.gitExplorer.refreshNode', this.refreshNode, this);
        commands.registerCommand('gitlens.gitExplorer.openChanges', this.openChanges, this);
        commands.registerCommand('gitlens.gitExplorer.openChangesWithWorking', this.openChangesWithWorking, this);
        commands.registerCommand('gitlens.gitExplorer.openFile', this.openFile, this);
        commands.registerCommand('gitlens.gitExplorer.openFileRevision', this.openFileRevision, this);
        commands.registerCommand('gitlens.gitExplorer.openFileRevisionInRemote', this.openFileRevisionInRemote, this);
        commands.registerCommand('gitlens.gitExplorer.openChangedFiles', this.openChangedFiles, this);
        commands.registerCommand('gitlens.gitExplorer.openChangedFileChanges', this.openChangedFileChanges, this);
        commands.registerCommand('gitlens.gitExplorer.openChangedFileChangesWithWorking', this.openChangedFileChangesWithWorking, this);
        commands.registerCommand('gitlens.gitExplorer.openChangedFileRevisions', this.openChangedFileRevisions, this);
        commands.registerCommand('gitlens.gitExplorer.applyChanges', this.applyChanges, this);

        const editorChangedFn = Functions.debounce(this.onActiveEditorChanged, 500);
        context.subscriptions.push(window.onDidChangeActiveTextEditor(editorChangedFn, this));

        const visibleEditorsChangedFn = Functions.debounce(this.onVisibleEditorsChanged, 500);
        context.subscriptions.push(window.onDidChangeVisibleTextEditors(visibleEditorsChangedFn, this));

        context.subscriptions.push(workspace.onDidChangeConfiguration(this.onConfigurationChanged, this));

        this.onConfigurationChanged();
    }

    async getTreeItem(node: ExplorerNode): Promise<TreeItem> {
        return node.getTreeItem();
    }

    private _loading: Promise<void> | undefined;

    async getChildren(node?: ExplorerNode): Promise<ExplorerNode[]> {
        if (this._loading !== undefined) {
            await this._loading;
            this._loading = undefined;
        }

        if (this._root === undefined) {
            if (this._view === GitExplorerView.History) return [new MessageNode(`No active file ${GlyphChars.Dash} no history to show`)];
            return [new MessageNode('No repositories found')];
        }

        if (node === undefined) return this._root.getChildren();
        return node.getChildren();
    }

    private async getRootNode(editor?: TextEditor): Promise<ExplorerNode | undefined> {
        switch (this._view) {
            case GitExplorerView.History: {
                const promise = this.getHistoryNode(editor || window.activeTextEditor);
                this._loading = promise.then(async _ => await Functions.wait(0));
                return promise;
            }
            default: {
                const promise = this.git.getRepositories();
                this._loading = promise.then(async _ => await Functions.wait(0));

                const repositories = await promise;
                if (repositories.length === 0) return undefined; // new MessageNode('No repositories found');

                if (repositories.length === 1) {
                    const repo = repositories[0];
                    return new RepositoryNode(new GitUri(Uri.file(repo.path), { repoPath: repo.path, fileName: repo.path }), repo, this.context, this.git);
                }

                return new RepositoriesNode(repositories, this.context, this.git);
            }
        }
    }

    private async getHistoryNode(editor: TextEditor | undefined): Promise<ExplorerNode | undefined> {
        // If we have no active editor, or no visible editors, or no trackable visible editors reset the view
        if (editor === undefined || window.visibleTextEditors.length === 0 || !window.visibleTextEditors.some(e => e.document && this.git.isTrackable(e.document.uri))) return undefined;
        // If we do have a visible trackable editor, don't change from the last state (avoids issues when focus switches to the problems/output/debug console panes)
        if (editor.document === undefined || !this.git.isTrackable(editor.document.uri)) return this._root;

        let uri = this.git.getGitUriForFile(editor.document.uri);
        if (uri === undefined) {
            const repoPath = await this.git.getRepoPath(editor.document.uri);
            if (repoPath === undefined) return undefined;

            uri = new GitUri(editor.document.uri, { repoPath: repoPath, fileName: editor.document.uri.fsPath });
        }

        if (UriComparer.equals(uri, this._root && this._root.uri)) return this._root;

        return new HistoryNode(uri, this.context, this.git);
    }

    private async onActiveEditorChanged(editor: TextEditor | undefined) {
        if (this._view !== GitExplorerView.History) return;

        const root = await this.getRootNode(editor);
        if (root === this._root) return;

        this._root = root;
        this.refresh(undefined, root);
    }

    private onConfigurationChanged() {
        const cfg = workspace.getConfiguration().get<IConfig>(ExtensionKey)!;

        const changed = !Objects.areEquivalent(cfg.gitExplorer, this._config && this._config.gitExplorer);

        if (cfg.gitExplorer.autoRefresh !== (this._config && this._config.gitExplorer.autoRefresh)) {
            this.setAutoRefresh(cfg.gitExplorer.autoRefresh);
        }

        if (cfg.gitExplorer.files.layout !== (this._config && this._config.gitExplorer.files.layout)) {
            setCommandContext(CommandContext.GitExplorerFilesLayout, cfg.gitExplorer.files.layout);
        }

        this._config = cfg;

        if (changed) {
            let view = cfg.gitExplorer.view;
            if (view === GitExplorerView.Auto) {
                view = this.context.workspaceState.get<GitExplorerView>(WorkspaceState.GitExplorerView, GitExplorerView.Repository);
            }

            this.reset(view);
        }
    }

    private onRepoChanged(reasons: RepoChangedReasons[]) {
        if (this._view !== GitExplorerView.Repository) return;

        // If we are changing the set of repositories then force a root node reset
        if (reasons.includes(RepoChangedReasons.Repositories)) {
            this._root = undefined;
        }

        this.refresh();
    }

    private onVisibleEditorsChanged(editors: TextEditor[]) {
        if (this._view !== GitExplorerView.History) return;

        // If we have no visible editors, or no trackable visible editors reset the view
        if (editors.length === 0 || !editors.some(e => e.document && this.git.isTrackable(e.document.uri))) {
            if (this._root === undefined) return;

            this._root = undefined;
            this.refresh();
        }
    }

    async refresh(node?: ExplorerNode, root?: ExplorerNode) {
        if (this._root === undefined || (root === undefined && this._view === GitExplorerView.History)) {
            this._root = await this.getRootNode(window.activeTextEditor);
        }

        this._onDidChangeTreeData.fire(node);
    }

    refreshNode(node: ExplorerNode, args: RefreshNodeCommandArgs) {
        if (node instanceof BranchHistoryNode) {
            node.maxCount = args.maxCount;
        }

        this.refresh(node);
    }

    async reset(view: GitExplorerView, force: boolean = false) {
        this.setView(view);

        if (force) {
            this._root = undefined;
        }
        this._root = await this.getRootNode(window.activeTextEditor);
        if (force) {
            this.refresh();
        }
    }

    setView(view: GitExplorerView) {
        if (this._view === view) return;

        if (this._config.gitExplorer.view === GitExplorerView.Auto) {
            this.context.workspaceState.update(WorkspaceState.GitExplorerView, view);
        }

        this._view = view;
        setCommandContext(CommandContext.GitExplorerView, this._view);

        if (view !== GitExplorerView.Repository) {
            this.git.stopWatchingFileSystem();
        }
    }

    async switchTo(view: GitExplorerView) {
        if (this._view === view) return;

        this.reset(view, true);
    }

    private async applyChanges(node: CommitNode | StashNode) {
        await this.git.checkoutFile(node.uri);
        return this.openFile(node);
    }

    private openChanges(node: CommitNode | StashNode) {
        const command = node.getCommand();
        if (command === undefined || command.arguments === undefined) return;

        const [uri, args] = command.arguments as [Uri, DiffWithPreviousCommandArgs];
        args.showOptions!.preview = false;
        return commands.executeCommand(command.command, uri, args);
    }

    private openChangesWithWorking(node: CommitNode | StashNode) {
        const args: DiffWithWorkingCommandArgs = {
            commit: node.commit,
            showOptions: {
                preserveFocus: true,
                preview: false

            }
        };
        return commands.executeCommand(Commands.DiffWithWorking, new GitUri(node.commit.uri, node.commit), args);
    }

    private openFile(node: CommitNode | StashNode) {
        return openEditor(node.uri, { preserveFocus: true, preview: false });
    }

    private openFileRevision(node: CommitNode | StashNode | CommitFileNode, options: OpenFileRevisionCommandArgs = { showOptions: { preserveFocus: true, preview: false } }) {
        return openEditor(options.uri || GitService.toGitContentUri(node.uri), options.showOptions || { preserveFocus: true, preview: false });
    }

    private async openChangedFileChanges(node: CommitNode | StashNode, options: TextDocumentShowOptions = { preserveFocus: false, preview: false }) {
        const repoPath = node.commit.repoPath;
        const uris = node.commit.fileStatuses
            .map(s => GitUri.fromFileStatus(s, repoPath));
        for (const uri of uris) {
            await this.openDiffWith(repoPath,
                { uri: uri, sha: node.commit.previousSha !== undefined ? node.commit.previousSha : GitService.fakeSha },
                { uri: uri, sha: node.commit.sha }, options);
        }
    }

    private async openChangedFileChangesWithWorking(node: CommitNode | StashNode, options: TextDocumentShowOptions = { preserveFocus: false, preview: false }) {
        const repoPath = node.commit.repoPath;
        const uris = node.commit.fileStatuses
            .filter(s => s.status !== 'D')
            .map(s => GitUri.fromFileStatus(s, repoPath));
        for (const uri of uris) {
            await this.openDiffWith(repoPath,
                { uri: uri, sha: node.commit.sha },
                { uri: uri, sha: '' }, options);
        }
    }

    private async openChangedFiles(node: CommitNode | StashNode, options: TextDocumentShowOptions = { preserveFocus: false, preview: false }) {
        const repoPath = node.commit.repoPath;
        const uris = node.commit.fileStatuses.filter(s => s.status !== 'D').map(s => GitUri.fromFileStatus(s, repoPath));
        for (const uri of uris) {
            await openEditor(uri, options);
        }
    }

    private async openChangedFileRevisions(node: CommitNode | StashNode, options: TextDocumentShowOptions = { preserveFocus: false, preview: false }) {
        const uris = node.commit.fileStatuses
            .filter(s => s.status !== 'D')
            .map(s => GitService.toGitContentUri(node.commit.sha, s.fileName, node.commit.repoPath, s.originalFileName));
        for (const uri of uris) {
            await openEditor(uri, options);
        }
    }

    private async openDiffWith(repoPath: string, lhs: DiffWithCommandArgsRevision, rhs: DiffWithCommandArgsRevision, options: TextDocumentShowOptions = { preserveFocus: false, preview: false }) {
        const diffArgs: DiffWithCommandArgs = {
            repoPath: repoPath,
            lhs: lhs,
            rhs: rhs,
            showOptions: options
        };
        return commands.executeCommand(Commands.DiffWith, diffArgs);
    }

    private async openFileRevisionInRemote(node: CommitNode | StashNode) {
        return commands.executeCommand(Commands.OpenFileInRemote, new GitUri(node.commit.uri, node.commit), { range: false } as OpenFileInRemoteCommandArgs);
    }

    private _autoRefreshDisposable: Disposable | undefined;

    private async setAutoRefresh(enabled: boolean, userToggle: boolean = false) {
        if (this._autoRefreshDisposable !== undefined) {
            this._autoRefreshDisposable.dispose();
            this._autoRefreshDisposable = undefined;
        }

        if (enabled) {
            enabled = this.context.workspaceState.get<boolean>(WorkspaceState.GitExplorerAutoRefresh, true);

            if (userToggle) {
                enabled = !enabled;
                await this.context.workspaceState.update(WorkspaceState.GitExplorerAutoRefresh, enabled);
            }

            if (enabled) {
                const repoChangedFn = Functions.debounce(this.onRepoChanged, 250);
                this._autoRefreshDisposable = this.git.onDidChangeRepo(repoChangedFn, this);
                this.context.subscriptions.push(this._autoRefreshDisposable);
            }
        }

        setCommandContext(CommandContext.GitExplorerAutoRefresh, enabled);

        if (userToggle) {
            this.refresh();
        }
    }

    private async setFilesLayout(layout: GitExplorerFilesLayout) {
        await workspace.getConfiguration(ExtensionKey).update('gitExplorer.files.layout', layout, true);
    }
}