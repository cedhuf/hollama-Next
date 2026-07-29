// The behind-the-scenes instructions Hollama injects into a request, in one place.
//
// Each has a built-in default (the single source of truth) and can be overridden by
// the user in Settings → Tools → System instructions. Dynamic bits are filled in at
// send time via {placeholder} tokens, so an override keeps working as long as it
// preserves the token it needs.

export type PromptKey =
	| 'currentDate'
	| 'searchRouter'
	| 'searchContext'
	| 'pageContext'
	| 'interactiveChoices';

export interface PromptDef {
	/** Short label for the Settings dropdown. */
	label: string;
	/** Placeholder tokens this prompt fills in at send time (shown in the help line). */
	placeholders?: string[];
	/** One-line description of what the prompt does. */
	hint: string;
	/** The built-in default text. */
	default: string;
}

export const DEFAULT_PROMPTS: Record<PromptKey, PromptDef> = {
	currentDate: {
		label: 'Current date',
		placeholders: ['{datetime}'],
		hint: 'Anchors the model in the present so it trusts recent facts.',
		default:
			'The current date and time is {datetime}. Treat this as the authoritative present — it overrides any date you would infer from your training data. Do not reject something as impossible, fake, or a rumour merely because it postdates your training cutoff; weigh it on its own merits and on any sources you are given.'
	},
	searchRouter: {
		label: 'Web search — query',
		placeholders: ['{datetime}'],
		hint: 'Decides whether to search and writes the query (auto mode).',
		default: `You are a web-search query writer. Look at the user's LAST message and decide whether answering it needs a live web lookup right now.

Reply with EITHER a single web search query (a few keywords, in the user's language, no quotes, nothing else) OR the single word NONE.

The current date is {datetime} — use it to resolve "today/now/latest" and never to write an outdated year.

Output a query when the message involves: weather, news, prices, stocks, sports, schedules, opening hours; anything tied to "today/now/current/latest/aujourd'hui/actualités" or a recent or upcoming date; events, releases or facts that may have changed after your training; or an explicit request to search.

Reply NONE for timeless requests you can fully answer yourself (definitions, explanations, math, translation, coding, writing).

Write the query for the USER's information need — not your own beliefs:
- Use neutral, factual keywords (the topic itself). Do NOT add words like "rumor", "leak", "fake" or "hoax" just because you doubt something exists or has been released yet.
- Keep speculative terms ONLY when the user actually wants them — e.g. they ask what is rumored/leaked, or about an unannounced or unreleased product.
- Never reuse a wrong year from earlier in the chat; rely on the current date above.

Examples:
"Quelle est la météo aujourd'hui à Vichy ?" -> météo Vichy aujourd'hui
"Qui a gagné le match hier soir ?" -> résultat match hier soir
"Star Fox sur Switch 2 ?" -> Star Fox Switch 2 date de sortie
"Qu'est-ce qu'on sait de l'iPhone 18 Pro ?" -> iPhone 18 Pro fuites specs rumeurs
"Explique-moi la photosynthèse" -> NONE

Never answer the question yourself. Output only the query, or NONE.`
	},
	searchContext: {
		label: 'Web search — results',
		placeholders: ['{results}'],
		hint: 'How the model uses the retrieved results and cites them.',
		default: `Web search results for the user's question, retrieved just now (current as of today). Use them as your primary source and prefer the most recent and official ones. Calibrate your confidence to the sources: state confirmed or official information as fact, and clearly flag anything that is only a rumour, leak or insider claim as such. Cite the sources you rely on inline with their [number] (e.g. "... releases on June 25 [1].") so they can be verified:

{results}`
	},
	pageContext: {
		label: 'Web fetch — pages',
		placeholders: ['{pages}'],
		hint: 'How the model uses the full text of the pages the message links to.',
		default: `The full text of the pages the user linked to, retrieved just now. This is the actual content of those pages, not a summary: base your answer on it rather than on what you remember about them, and quote or cite the relevant parts. If a page could not be read, say so plainly instead of answering from memory. Cite pages inline with their [number]:

{pages}`
	},
	interactiveChoices: {
		label: 'Interactive choices',
		hint: 'Teaches the model the <ask> quick-choice protocol.',
		default: `# Interactive choices
When the user's request is genuinely ambiguous and hinges on a personal preference you cannot infer, you MAY ask for a quick choice instead of guessing. To do so, output a SINGLE block exactly like this and then STOP — write nothing before or after it:

<ask>
{"questions":[{"question":"...","type":"single_select","options":["...","..."]}]}
</ask>

Rules:
- At most 3 questions; each with 2 to 4 short options. "type" is "single_select" or "multi_select".
- Write the questions and options in the user's language.
- Use this ONLY to clarify a preference before carrying out a task (planning, recommendations, design choices, …).
- Do NOT use it for factual or direct questions, when the user already gave enough constraints, or when they are asking for YOUR opinion between options.
- When you use it, the block must be the entire message — no greeting, no explanation, no answer.`
	}
};

/** Order shown in the Settings dropdown. */
export const PROMPT_KEYS: PromptKey[] = [
	'currentDate',
	'searchRouter',
	'searchContext',
	'pageContext',
	'interactiveChoices'
];

/**
 * The effective text for a prompt: a non-empty user override, else the built-in
 * default. Any {token} present in `vars` is substituted in.
 */
export function resolvePrompt(
	key: PromptKey,
	overrides: Partial<Record<PromptKey, string>> | undefined,
	vars?: Record<string, string>
): string {
	const override = overrides?.[key]?.trim();
	let text = override || DEFAULT_PROMPTS[key].default;
	if (vars) {
		// split/join rather than replace(All): the value (e.g. search results) can
		// contain `$&`, `$'`… which string replacement would interpret specially.
		for (const [token, value] of Object.entries(vars)) {
			text = text.split(`{${token}}`).join(value);
		}
	}
	return text;
}
