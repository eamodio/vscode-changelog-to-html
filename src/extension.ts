'use strict';
import { commands, ExtensionContext, Position, window, workspace, WorkspaceEdit } from 'vscode';

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
	let editor = window.activeTextEditor;
	if (!editor) return;

	const content = editor.document.getText(editor.selection);

	const document = await workspace.openTextDocument({ language: 'html' });

	const edit = new WorkspaceEdit();

	let count = 0;

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
				.replace(/Fixes (\[.+?\]\(.+?\)) -/, 'Fixes $1 &mdash;')
				.replace(/!\[(.+?) \]\((.+?) \)/g, '<img class="changelog__image" src="$2" alt="$1" />')
				.replace(/\[(.+?)\]\((.+?\/issues\/.+?)\)/g, '<a title="Open Issue $1" href="$2">$1</a>')
				.replace(/\[(.+?)\]\((.+?\/pull\/.+?)\)/g, '<a title="Open Pull Request $1" href="$2">$1</a>')
				.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
				.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
				.replace(/_(.+?)_/g, '<i>$1</i>')
				.replace(/`(.+?)`/g, '<code>$1</code>')
				.replace(/\\(\*|_)/g, '$1');

			edit.insert(
				document.uri,
				new Position(count++, 0),
				`<li${indent.length !== 0 ? ' class="changelog__list-item--sub"' : ''}>`
			);
			edit.insert(
				document.uri,
				new Position(count++, 0),
				`\t<div class="changelog__badge changelog__badge--${type}">${
					indent.length === 0 ? typeToBadge.get(type) ?? 'NEW' : subtypeToBadge.get(type) ?? '+'
				}</div>`
			);
			edit.insert(document.uri, new Position(count++, 0), `\t<div class="changelog__content">${entry}</div>`);
			edit.insert(
				document.uri,
				new Position(count++, 0),
				'\t<div class="changelog__details changelog__details--list"></div>'
			);
			edit.insert(document.uri, new Position(count++, 0), '</li>');
		}
	}

	await workspace.applyEdit(edit);

	editor = await window.showTextDocument(document);
	await commands.executeCommand('editor.action.formatDocument');
}
