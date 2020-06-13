'use strict';
import { Disposable, env, QuickInputButton, Range, ThemeIcon, Uri, window } from 'vscode';
import { DynamicAutolinkReference } from '../../annotations/autolinks';
import { AutolinkReference } from '../../config';
import { Container } from '../../container';
import { IssueOrPullRequest } from '../models/issue';
import { PullRequest } from '../models/pullRequest';
import { RemoteProviderWithApi } from './provider';

const issueEnricher3rdParyRegex = /\b(\w+\\?-?\w+(?!\\?-)\/\w+\\?-?\w+(?!\\?-))\\?#([0-9]+)\b/g;

export class GitHubRemote extends RemoteProviderWithApi<{ token: string }> {
	private readonly Buttons = class {
		// static readonly Help: QuickInputButton = {
		// 	iconPath: new ThemeIcon('question'),
		// 	tooltip: 'Help',
		// };

		static readonly OpenPATs: QuickInputButton = {
			iconPath: new ThemeIcon('globe'),
			tooltip: 'Open Personal Access Tokens on GitHub',
		};
	};

	constructor(domain: string, path: string, protocol?: string, name?: string, custom: boolean = false) {
		super(domain, path, protocol, name, custom);
	}

	get apiBaseUrl() {
		return this.custom ? `${this.protocol}://${this.domain}/api` : `https://api.${this.domain}`;
	}

	private _autolinks: (AutolinkReference | DynamicAutolinkReference)[] | undefined;
	get autolinks(): (AutolinkReference | DynamicAutolinkReference)[] {
		if (this._autolinks === undefined) {
			this._autolinks = [
				{
					prefix: '#',
					url: `${this.baseUrl}/issues/<num>`,
					title: `Open Issue #<num> on ${this.name}`,
				},
				{
					prefix: 'gh-',
					url: `${this.baseUrl}/issues/<num>`,
					title: `Open Issue #<num> on ${this.name}`,
					ignoreCase: true,
				},
				{
					linkify: (text: string) =>
						text.replace(
							issueEnricher3rdParyRegex,
							`[$&](${this.protocol}://${this.domain}/$1/issues/$2 "Open Issue #$2 from $1 on ${this.name}")`,
						),
				},
			];
		}
		return this._autolinks;
	}

	get icon() {
		return 'github';
	}

	get name() {
		return this.formatName('GitHub');
	}

	async connect() {
		const input = window.createInputBox();
		input.ignoreFocusOut = true;

		let disposable: Disposable | undefined;
		let token: string | undefined;

		try {
			token = await new Promise<string | undefined>(resolve => {
				disposable = Disposable.from(
					input.onDidHide(() => resolve(undefined)),
					input.onDidTriggerButton(e => {
						if (e === this.Buttons.OpenPATs) {
							void env.openExternal(Uri.parse('https://github.com/settings/tokens'));
						}

						// if (e === this.Buttons.Help) {
						// 	// TODO@eamodio link to proper wiki
						// 	void env.openExternal(Uri.parse('https://github.com/eamodio/vscode-gitlens/wiki'));
						// }
					}),
					input.onDidChangeValue(
						e =>
							(input.validationMessage =
								e == null || e.length === 0
									? 'Must be a valid GitHub personal access token'
									: undefined),
					),
					input.onDidAccept(() => resolve(input.value)),
				);

				// TODO@eamodio add this button once we have a valid help link above
				input.buttons = [this.Buttons.OpenPATs]; // [this.Buttons.Help];
				input.title = `Connect to ${this.name}`;
				input.prompt = 'Enter a GitHub personal access token';
				input.placeholder = 'Generate a personal access token (with repo access) from github.com (required)';

				input.show();
			});
		} finally {
			input.dispose();
			disposable?.dispose();
		}

		if (token == null || token.length === 0) return false;

		await this.saveCredentials({ token: token });
		return true;
	}

	protected getUrlForBranches(): string {
		return `${this.baseUrl}/branches`;
	}

	protected getUrlForBranch(branch: string): string {
		return `${this.baseUrl}/commits/${branch}`;
	}

	protected getUrlForCommit(sha: string): string {
		return `${this.baseUrl}/commit/${sha}`;
	}

	protected getUrlForFile(fileName: string, branch?: string, sha?: string, range?: Range): string {
		let line;
		if (range) {
			if (range.start.line === range.end.line) {
				line = `#L${range.start.line}`;
			} else {
				line = `#L${range.start.line}-L${range.end.line}`;
			}
		} else {
			line = '';
		}

		if (sha) return `${this.baseUrl}/blob/${sha}/${fileName}${line}`;
		if (branch) return `${this.baseUrl}/blob/${branch}/${fileName}${line}`;
		return `${this.baseUrl}?path=${fileName}${line}`;
	}

	protected async onGetIssueOrPullRequest(
		{ token }: { token: string },
		id: string,
	): Promise<IssueOrPullRequest | undefined> {
		const [owner, repo] = this.splitPath();
		return (await Container.github)?.getIssueOrPullRequest(this.name, token, owner, repo, Number(id), {
			baseUrl: this.apiBaseUrl,
		});
	}

	protected async onGetPullRequestForCommit(
		{ token }: { token: string },
		ref: string,
	): Promise<PullRequest | undefined> {
		const [owner, repo] = this.splitPath();
		return (await Container.github)?.getPullRequestForCommit(this.name, token, owner, repo, ref, {
			baseUrl: this.apiBaseUrl,
		});
	}
}
