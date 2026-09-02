import type { TranslationFunctions } from '$i18n/i18n-types';

/**
 * The switches behind the composer's lightning button.
 *
 * Both composers show the same menu, and each used to build its own list from
 * its own state: the two drifted, and the labels were hardcoded in English in
 * both. Defined once here; the callers supply the values, setters and wording.
 */

export interface ChatToolValues {
	webSearch: boolean;
	webFetch: boolean;
	interactiveChoices: boolean;
	sendCurrentDate: boolean;
	thinking: boolean;
	/** The account's MCP servers, all of them together rather than one by one. */
	mcp: boolean;
}

/** What this conversation can actually offer: an absent tool is not listed. */
export interface ChatToolAvailability {
	webSearch: boolean;
	webFetch: boolean;
	reasoning: boolean;
	/** Whether this account has any MCP server switched on at all. */
	mcp: boolean;
}

export type ChatToolLabels = Record<keyof ChatToolValues, string>;

/** From the keys the Tools settings already use, so a tool is named the same wherever it appears, and translated rather than hardcoded. */
export function toolLabels(LL: TranslationFunctions): ChatToolLabels {
	return {
		webSearch: LL.webSearch(),
		webFetch: LL.webFetchToggle(),
		interactiveChoices: LL.interactiveChoicesTitle(),
		sendCurrentDate: LL.currentDateTitle(),
		thinking: LL.reasoning(),
		mcp: LL.mcpTools()
	};
}

export interface ChatToolToggle {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}

/** `set` takes the key and the new value rather than each caller passing five closures: the session composer writes into `editor`, the home screen into its own `$state`. */
export function buildChatTools(
	values: ChatToolValues,
	set: (key: keyof ChatToolValues, value: boolean) => void,
	available: ChatToolAvailability,
	labels: ChatToolLabels
): ChatToolToggle[] {
	const toggle = (key: keyof ChatToolValues): ChatToolToggle => ({
		label: labels[key],
		checked: !!values[key],
		onChange: (value) => set(key, value)
	});

	return [
		...(available.webSearch ? [toggle('webSearch')] : []),
		...(available.webFetch ? [toggle('webFetch')] : []),
		toggle('interactiveChoices'),
		toggle('sendCurrentDate'),
		// On = auto: Ollama only enables thinking when the model supports it.
		...(available.reasoning ? [toggle('thinking')] : []),
		// One switch for the lot, not one per server: this decides whether the
		// catalogues are sent at all, and which may run is decided call by call.
		...(available.mcp ? [toggle('mcp')] : [])
	];
}
