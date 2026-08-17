/**
 * Slash commands typed in the composer.
 *
 * Deliberately not a framework: a small registry and one regex. A command is
 * recognised only when the whole prompt is a single line starting with `/` and
 * naming a known command — so a message that merely begins with a slash (a path,
 * a regex, a date) is sent as text, and an unknown `/word` is too rather than
 * being swallowed with an error. `//` at the start escapes to a literal `/`.
 */

export type CommandName = 'compact' | 'clear' | 'context';

export interface SlashCommand {
	name: CommandName;
	/** Localised one-liner shown in the autocomplete. */
	description: string;
	/** False when the command cannot run right now. */
	available: boolean;
	/**
	 * Why it cannot run, shown in place of the description.
	 *
	 * An unavailable command stays listed and says why: dropping it from the menu
	 * entirely reads as the feature being broken, not as it having nothing to do.
	 */
	unavailableReason?: string;
}

const PATTERN = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;

export interface ParsedCommand {
	name: CommandName;
	args: string;
}

/**
 * The command a prompt invokes, or `null` when it is an ordinary message.
 *
 * `known` is passed in rather than hard-coded so the caller decides what exists,
 * and so a prompt naming an unknown command still goes out as a message.
 */
export function parseSlashCommand(prompt: string, known: CommandName[]): ParsedCommand | null {
	const trimmed = prompt.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
	// Multi-line means the user is writing a message that happens to open with a
	// slash, not invoking anything.
	if (trimmed.includes('\n')) return null;

	const match = PATTERN.exec(trimmed);
	if (!match) return null;

	const name = match[1].toLowerCase() as CommandName;
	if (!known.includes(name)) return null;
	return { name, args: (match[2] ?? '').trim() };
}

/** Strips the `//` escape so a message meant to start with a slash does. */
export function unescapeSlash(prompt: string): string {
	return prompt.startsWith('//') ? prompt.slice(1) : prompt;
}

/**
 * The prefix being typed, for the autocomplete — `null` unless the caret sits in
 * a lone `/word` on the first and only line. Returned lowercased and without the
 * slash, so `/Comp` matches `compact`.
 */
export function commandPrefix(prompt: string): string | null {
	if (!prompt.startsWith('/') || prompt.startsWith('//')) return null;
	if (prompt.includes('\n') || prompt.includes(' ')) return null;
	return prompt.slice(1).toLowerCase();
}
