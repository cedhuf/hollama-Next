import type { TranslationFunctions } from '$i18n/i18n-types';

/**
 * The switches behind the composer's lightning button.
 *
 * Both composers (the home screen and a conversation) show the same menu, but
 * each used to build its own list from its own state. The two drifted: a tool
 * added to one was simply missing from the other, and the labels were hardcoded
 * in English in both. The list is defined once here; the callers supply the
 * values, the setters and the wording.
 */

export interface ChatToolValues {
	webSearch: boolean;
	webFetch: boolean;
	interactiveChoices: boolean;
	sendCurrentDate: boolean;
	thinking: boolean;
}

/** What this conversation can actually offer: an absent tool is not listed. */
export interface ChatToolAvailability {
	webSearch: boolean;
	webFetch: boolean;
	reasoning: boolean;
}

export type ChatToolLabels = Record<keyof ChatToolValues, string>;

/**
 * The menu wording, from the keys the Tools settings already use, so a tool is
 * named the same wherever it appears, and translated rather than hardcoded.
 */
export function toolLabels(LL: TranslationFunctions): ChatToolLabels {
	return {
		webSearch: LL.webSearch(),
		webFetch: LL.webFetchToggle(),
		interactiveChoices: LL.interactiveChoicesTitle(),
		sendCurrentDate: LL.currentDateTitle(),
		thinking: LL.reasoning()
	};
}

export interface ChatToolToggle {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}

/**
 * `set` takes the key and the new value rather than each caller passing five
 * closures: the session composer writes into `editor`, the home screen into its
 * own `$state`, and neither shape has to leak in here.
 */
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
		...(available.reasoning ? [toggle('thinking')] : [])
	];
}
