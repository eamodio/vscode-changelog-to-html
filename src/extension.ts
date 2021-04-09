'use strict';
import { commands, ExtensionContext, Position, QuickPickItem, Range, window, workspace, WorkspaceEdit } from 'vscode';

export function activate(context: ExtensionContext): void {
	context.subscriptions.push(commands.registerCommand('changelog-to-html.convert', convert));
}

type ChangeLogType = 'added' | 'changed' | 'fixed' | 'removed';

const typeToBadge = new Map([
	['added', 'NEW'],
	['changed', 'IMPROVED'],
	['fixed', 'FIXED'],
	['removed', 'REMOVED'],
]);

const subtypeToBadge = new Map([
	['added', '+'],
	['changed', '~'],
	['fixed', '!'],
	['removed', '-'],
]);

async function convert() {
	const uris = await workspace.findFiles('**/CHANGELOG.md', '**/node_modules/**');
	if (uris.length === 0) return;

	const document = await workspace.openTextDocument(uris[0]);
	const changelog = document.getText();

	const versions: VersionQuickPickItem[] = [];

	let major;
	let minor;
	let patch;
	let version: VersionQuickPickItem | undefined = undefined;

	const versionsRegex = /^## \[?v?(\d+)\.(\d+)(?:\.(\d+))?\]?/gm;

	let match;
	do {
		match = versionsRegex.exec(changelog);
		if (match == null) break;

		[, major, minor, patch] = match;

		if (version) {
			version.end = match.index;
		}

		version = new VersionQuickPickItem(major, minor, patch, match.index, -1);

		versions.push(version);
	} while (true);

	const pick = await window.showQuickPick(versions, { placeHolder: 'Choose a version' });
	if (pick == null) return;

	const content = document.getText(new Range(document.positionAt(pick.start), document.positionAt(pick.end)));

	const untitled = await workspace.openTextDocument({ language: 'html' });

	const edit = new WorkspaceEdit();

	let count = 0;

	edit.insert(
		untitled.uri,
		new Position(count++, 0),
		`<ul class="changelog__list" data-visibility="version" data-version="${pick.format('majorMinor')}">`
	);
	edit.insert(untitled.uri, new Position(count++, 0), `\t<!-- #region ${pick.format()} -->`);
	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(
		untitled.uri,
		new Position(count++, 0),
		`\t<li id="${pick.format()}" class="changelog__list-item--version">`
	);
	edit.insert(
		untitled.uri,
		new Position(count++, 0),
		`\t\t<div class="changelog__badge changelog__badge--version">${pick.format()}</div>`
	);
	const now = new Date();
	edit.insert(
		untitled.uri,
		new Position(count++, 0),
		`\t\t<div class="changelog__date">${now
			.toLocaleString('default', { month: 'long' })
			.toLocaleUpperCase()} &nbsp;${now.getFullYear()}</div>`
	);
	edit.insert(untitled.uri, new Position(count++, 0), '\t\t<div class="changelog__details"></div>');
	edit.insert(untitled.uri, new Position(count++, 0), '\t</li>');
	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '\n');

	let type: ChangeLogType = 'added';
	for (const line of content.split('\n')) {
		let match = /^### (Added|Changed|Fixed|Removed)$/.exec(line);
		if (match) {
			type = match[1].toLowerCase() as ChangeLogType;

			continue;
		}

		match = /^(\s*)- (.+)$/.exec(line);
		if (match) {
			// eslint-disable-next-line prefer-const
			let [, indent, entry] = match;

			entry = entry
				.replace(/Fixes (\[[^[\]]+?\]\([^()]+?\)) -/, 'Fixes $1 &mdash;')
				.replace(/!\[([^[\]]+?) \]\(([^()]+?) \)/g, '<img class="changelog__image" src="$2" alt="$1" />')
				.replace(/\[([^[\]]+?)\]\(([^()]+?\/issues\/[^()]+?)\)/g, '<a title="Open Issue $1" href="$2">$1</a>')
				.replace(
					/\[(PR ([^[\]]+?))\]\(([^()]+?\/pull\/[^()]+?)\)/g,
					'<a title="Open Pull Request $2" href="$3">$1</a>'
				)
				.replace(/\[([^[\]]+?)\]\(([^()]+?)\)/g, '<a href="$2">$1</a>')
				.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
				.replace(/_(.+?)_/g, '<i>$1</i>')
				.replace(/`(.+?)`/g, '<code>$1</code>')
				.replace(/\\(\*|_)/g, '$1');

			edit.insert(
				untitled.uri,
				new Position(count++, 0),
				`\t<li${indent.length !== 0 ? ' class="changelog__list-item--sub"' : ''}>`
			);
			edit.insert(
				untitled.uri,
				new Position(count++, 0),
				`\t\t<div class="changelog__badge changelog__badge--${type}">${
					indent.length === 0 ? typeToBadge.get(type) ?? 'NEW' : subtypeToBadge.get(type) ?? '+'
				}</div>`
			);
			edit.insert(untitled.uri, new Position(count++, 0), `\t<div class="changelog__content">${entry}</div>`);
			edit.insert(
				untitled.uri,
				new Position(count++, 0),
				'\t\t<div class="changelog__details changelog__details--list"></div>'
			);
			edit.insert(untitled.uri, new Position(count++, 0), '</li>');
		}
	}

	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '\t<!-- #endregion -->');
	edit.insert(untitled.uri, new Position(count++, 0), '</ul>');

	await workspace.applyEdit(edit);

	void (await window.showTextDocument(untitled));
	await commands.executeCommand('editor.action.formatDocument');
}

class VersionQuickPickItem implements QuickPickItem {
	constructor(
		public readonly major: string,
		public readonly minor: string,
		public readonly patch: string | undefined,
		public readonly start: number,
		public end: number
	) {}

	get label(): string {
		return this.format();
	}

	format(style: 'majorMinorPatch' | 'majorMinor' = 'majorMinorPatch'): string {
		if (style === 'majorMinor') {
			return `${this.major}.${this.minor}`;
		}
		return `${this.major}.${this.minor}${this.patch ? `.${this.patch}` : ''}`;
	}
}
