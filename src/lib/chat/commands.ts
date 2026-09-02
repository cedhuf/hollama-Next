/**
 * Slash commands typed in the composer.
 *
 * A small registry and one regex. A command is recognised only when the whole
 * prompt is a single line naming a known one, so a message that merely begins
 * with a slash is sent as text, and so is an unknown `/word`. `//` escapes to a
 * literal `/`.
 */

export type CommandName = 'compact' | 'clear' | 'context' | 'playbooks';

/** The distinction is not decoration: a command that takes no arguments only matches when it is given none, so `/clear the air before we start` is the sentence it looks like. */
export interface CommandSpec {
	name: CommandName;
	/** Free text after the name means something to this command. */
	takesArgs?: boolean;
}

export interface SlashCommand extends CommandSpec {
	/** What arguments are for, shown after the name in the menu. */
	argsHint?: string;
	/** Localised one-liner shown in the autocomplete. */
	description: string;
	/** False when the command cannot run right now. */
	available: boolean;
	/** An unavailable command stays listed and says why: dropping it from the menu reads as the feature being broken rather than as it having nothing to do. */
	unavailableReason?: string;
}

const PATTERN = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;

export interface ParsedCommand {
	name: CommandName;
	args: string;
}

/** `known` is passed in rather than hard-coded, so the caller decides what exists and a prompt naming an unknown command still goes out as a message. */
export function parseSlashCommand(prompt: string, known: CommandSpec[]): ParsedCommand | null {
	const trimmed = prompt.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
	// Multi-line means the user is writing a message that happens to open with a
	// slash, not invoking anything.
	if (trimmed.includes('\n')) return null;

	const match = PATTERN.exec(trimmed);
	if (!match) return null;

	const name = match[1].toLowerCase() as CommandName;
	const spec = known.find((command) => command.name === name);
	if (!spec) return null;

	const args = (match[2] ?? '').trim();
	// Text after a command that has no use for it is not an argument, it is a
	// sentence starting with a word we recognise.
	if (args && !spec.takesArgs) return null;

	return { name, args };
}

/** Strips the `//` escape so a message meant to start with a slash does. */
export function unescapeSlash(prompt: string): string {
	return prompt.startsWith('//') ? prompt.slice(1) : prompt;
}

/** `null` unless the caret sits in a lone `/word` on the first and only line. Lowercased and without the slash, so `/Comp` matches `compact`. */
export function commandPrefix(prompt: string): string | null {
	if (!prompt.startsWith('/') || prompt.startsWith('//')) return null;
	if (prompt.includes('\n') || prompt.includes(' ')) return null;
	return prompt.slice(1).toLowerCase();
}
