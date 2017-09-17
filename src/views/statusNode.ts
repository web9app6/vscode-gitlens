import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ExplorerNode, ResourceType } from './explorerNode';
import { GitService, GitUri } from '../gitService';
import { StatusFilesNode } from './statusFilesNode';
import { StatusUpstreamNode } from './statusUpstreamNode';

export class StatusNode extends ExplorerNode {

    readonly resourceType: ResourceType = 'gitlens:status';

    constructor(
        uri: GitUri,
        protected readonly context: ExtensionContext,
        protected readonly git: GitService
    ) {
        super(uri);
    }

    async getChildren(): Promise<ExplorerNode[]> {
        const status = await this.git.getStatusForRepo(this.uri.repoPath!);
        if (status === undefined) return [];

        const children: ExplorerNode[] = [];

        if (status.state.behind) {
            children.push(new StatusUpstreamNode(status, 'behind', this.context, this.git));
        }

        if (status.state.ahead) {
            children.push(new StatusUpstreamNode(status, 'ahead', this.context, this.git));
        }

        if (status.files.length !== 0 || status.state.ahead && this.git.config.insiders) {
            const range = status.state.ahead
                ? `${status.upstream}..${status.branch}`
                : undefined;
            children.splice(0, 0, new StatusFilesNode(status, range, this.context, this.git));
        }

        return children;
    }

    async getTreeItem(): Promise<TreeItem> {
        const status = await this.git.getStatusForRepo(this.uri.repoPath!);
        if (status === undefined) return new TreeItem('No repo status');

        let hasChildren = false;
        let label = '';
        let iconSuffix = '';
        if (status.upstream) {
            if (!status.state.ahead && !status.state.behind) {
                label = `${status.branch} is up-to-date with ${status.upstream}`;
            }
            else {
                label = `${status.branch} is not up-to-date with ${status.upstream}`;
                hasChildren = true;
                if (status.state.ahead && status.state.behind) {
                    iconSuffix = '-yellow';
                }
                else if (status.state.ahead) {
                    iconSuffix = '-green';
                }
                else if (status.state.behind) {
                    iconSuffix = '-red';
                }
            }
        }
        else {
            label = `${status.branch} is up-to-date`;
        }

        if (this.git.config.insiders) {
            hasChildren = hasChildren || status.files.length !== 0;
        }

        const item = new TreeItem(label, hasChildren ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None);
        item.contextValue = this.resourceType;

        item.iconPath = {
            dark: this.context.asAbsolutePath(`images/dark/icon-repo${iconSuffix}.svg`),
            light: this.context.asAbsolutePath(`images/light/icon-repo${iconSuffix}.svg`)
        };

        return item;
    }
}