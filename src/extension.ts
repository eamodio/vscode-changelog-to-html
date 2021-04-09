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

	type VersionQuickPickItem = QuickPickItem & {
		version: { major: string; minor: string; patch: string };
		start: number;
		end: number;
	};
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

		version = {
			label: `${major}.${minor}${patch ? `.${patch}` : ''}`,
			version: {
				major: major,
				minor: minor,
				patch: patch,
			},
			start: match.index,
			end: -1,
		};

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
		`<ul class="changelog__list" data-visibility="version" data-version="${pick.version.major}.${pick.version.minor}">`
	);
	edit.insert(
		untitled.uri,
		new Position(count++, 0),
		`<!-- #region ${pick.version.major}.${pick.version.minor}${
			pick.version.patch ? `.${pick.version.patch}` : ''
		} -->`
	);
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
				`<li${indent.length !== 0 ? ' class="changelog__list-item--sub"' : ''}>`
			);
			edit.insert(
				untitled.uri,
				new Position(count++, 0),
				`\t<div class="changelog__badge changelog__badge--${type}">${
					indent.length === 0 ? typeToBadge.get(type) ?? 'NEW' : subtypeToBadge.get(type) ?? '+'
				}</div>`
			);
			edit.insert(untitled.uri, new Position(count++, 0), `\t<div class="changelog__content">${entry}</div>`);
			edit.insert(
				untitled.uri,
				new Position(count++, 0),
				'\t<div class="changelog__details changelog__details--list"></div>'
			);
			edit.insert(untitled.uri, new Position(count++, 0), '</li>');
		}
	}

	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '\n');
	edit.insert(untitled.uri, new Position(count++, 0), '<!-- #endregion -->');
	edit.insert(untitled.uri, new Position(count++, 0), '</ul>');

	await workspace.applyEdit(edit);

	void (await window.showTextDocument(untitled));
	await commands.executeCommand('editor.action.formatDocument');
}
