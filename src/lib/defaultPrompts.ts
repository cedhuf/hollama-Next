// The behind-the-scenes instructions Llooma injects into a request, in one place.
//
// Each has a built-in default (the single source of truth) and can be overridden by
// the user in Settings → Tools → System instructions. Dynamic bits are filled in at
// send time via {placeholder} tokens, so an override keeps working as long as it
// preserves the token it needs.

export type PromptKey =
	| 'currentDate'
	| 'searchRouter'
	| 'searchNone'
	| 'searchContext'
	| 'searchRecall'
	| 'pageContext'
	| 'searchRead'
	| 'interactiveChoices'
	| 'compact'
	| 'compactContext';

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

Reply with EITHER a single web search query (a few keywords, no quotes, nothing else) OR the single word NONE.

The current date is {datetime} — use it to resolve "today/now/latest" and never to write an outdated year.

Output a query when the message involves: weather, news, prices, stocks, sports, schedules, opening hours; anything tied to "today/now/current/latest/aujourd'hui/actualités" or a recent or upcoming date; events, releases or facts that may have changed after your training; or an explicit request to search.

Output a query as well when the message asks for a specific fact about a NAMED thing — a game, film, book, product, company, person, place, API — and you are not certain of that fact. Unfamiliar or niche names are the strongest reason to search, not a reason to give up: a lookup costs little, a confident wrong answer costs the user. This holds even when the subject is timeless (game mechanics, plot details, specifications, discography): timeless is about the fact not changing, not about you knowing it.

Search too when the conversation shows the previous answer fell short — the user pushes back, corrects, insists the thing exists, or repeats the question after an "I don't know" or a request for clarification. In that case write the query from the ORIGINAL question, not from the pushback.

Reply NONE for requests you can genuinely answer yourself from general knowledge: definitions, explanations, math, translation, coding, writing, and messages that ask nothing factual (greetings, thanks, questions about you or this conversation).

Reply NONE too when the user is asking you to PRODUCE something — a recipe, a plan, a text, code, a suggestion — even when it has a name and even when they name a specific one. Naming what they want made is not asking for a fact about it.

Write the query for the USER's information need, not your own beliefs:
- Use neutral, factual keywords (the topic itself). Do NOT add words like "rumor", "leak", "fake" or "hoax" just because you doubt something exists or has been released yet.
- Keep speculative terms ONLY when the user actually wants them, e.g. they ask what is rumored/leaked, or about an unannounced or unreleased product.
- Never reuse a wrong year from earlier in the chat; rely on the current date above.

Write the query in the language the ANSWER is written in, which is not always the user's:
- News, weather, local businesses, law, culture and anything tied to a place: the user's language.
- Named things from software, games, science and technology: usually English. Use the name exactly as its makers spell it, and write the rest of the query in English too.
- Never translate a proper noun yourself. A user asking in French about an item called "Large Shiny Glimmering Object" needs that string, not a French rendering of it: the rendering matches no page anywhere and returns five unrelated results.

Examples:
"Quelle est la météo aujourd'hui à Vichy ?" -> météo Vichy aujourd'hui
"Qui a gagné le match hier soir ?" -> résultat match hier soir
"Star Fox sur Switch 2 ?" -> Star Fox Switch 2 date de sortie
"Qu'est-ce qu'on sait de l'iPhone 18 Pro ?" -> iPhone 18 Pro fuites specs rumeurs
"Dans Ball x Pit, la boule fer évolue avec gel ou lumière ?" -> Ball x Pit iron ball evolution
(after "I could not find that game") "Si c'est un jeu très connu !" -> Ball x Pit iron ball evolution
"A quoi sert le gros objet luisant et miroitant ?" (about Core Keeper) -> Core Keeper Large Shiny Glimmering Object
"Explique-moi la photosynthèse" -> NONE
"Tu as cherché sur internet ?" -> NONE
"Bowl de quinoa aux légumes rôtis, ça me tente !" -> NONE

Never answer the question yourself. Output only the query, or NONE.`
	},
	searchNone: {
		label: 'Web search — not used',
		hint: 'Tells the model no search ran for this message, so it cannot claim it searched.',
		default: `No web search was run for THIS message: whatever you write now comes from your own knowledge. Never claim or imply otherwise: do not say you searched, looked it up, checked the web, or found nothing online, and do not narrate searching in your reasoning. If you do not know something, say plainly that you do not know it and that you have not looked it up for this question.

This applies to the current message only. It says nothing about earlier messages in this conversation: if you were given search results before, they were real, and this does not licence you to doubt or disown them.`
	},
	searchContext: {
		label: 'Web search — results',
		placeholders: ['{results}'],
		hint: 'How the model uses the retrieved results and cites them.',
		default: `Web search results for the user's question, retrieved just now (current as of today). Use them as your primary source and prefer the most recent and official ones. Calibrate your confidence to the sources: state confirmed or official information as fact, and clearly flag anything that is only a rumour, leak or insider claim as such. Cite the sources you rely on inline with their [number] (e.g. "... releases on June 25 [1].") so they can be verified.

Expect some of them to be irrelevant: a search engine matches words, not meaning, so an unrelated forum post can rank on a shared word alone. Ignore those outright. Do not cite them, do not summarise them, and do not stretch them into an answer. Judge each result on whether it is actually about what was asked.

{results}`
	},
	searchRecall: {
		label: 'Web search — earlier sources',
		placeholders: ['{results}'],
		hint: 'Reminds the model what it already looked up, so it stops disowning it.',
		default: `Sources you were shown earlier in this conversation, under the numbers your own answers cited them by. This is an index, not the pages: the text you were given at the time is no longer in front of you.

They are real. You searched, you were shown these, and you answered from them. So do not retract, hedge or apologise for a claim you drew from them merely because you cannot now see the text behind it, and never suggest you may have invented it. Being unable to recall a source is not evidence that it does not exist.

If a claim is challenged, or you find yourself doubting one, check it: reread the page. Taking back a sourced answer on a hunch is worse than either confirming it or correcting it on evidence.

{results}`
	},
	searchRead: {
		label: 'Web search — read a result',
		hint: 'Lets the model open the full text of a page instead of answering from snippets.',
		default: `Search results are titles and short snippets, not the pages themselves. You can ask for a page in full. Reply with ONLY a block like this and nothing else:

<read>1,3</read>

using the numbers of the results just given to you, or

<read>https://example.com/page</read>

using the address of any source listed above, including ones from earlier in this conversation. You may mix the two forms in one block. The full text will be given to you and you will then answer.

Ask when the detail decides the answer and the snippets do not settle it: a changelog, a release note, a specification. Ask too when you are about to contradict, doubt or take back something you said earlier from a source, which is exactly the moment to look rather than guess. Ask only for what you need, three pages at most. If what you already have is genuinely enough, just answer normally.`
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
	},
	compact: {
		label: 'Compaction — write the summary',
		hint: 'Condenses the earlier part of a conversation so it keeps fitting in the context.',
		default: `You are compacting a conversation so it keeps fitting in the model's context window. Everything before this point will be REPLACED by what you write: whatever you leave out is lost to the assistant, permanently, for the rest of the conversation.

Write a dense, factual record — not a description of the conversation. Never write "the user asked about X"; write X itself, with its answer.

Cover, in this order, skipping any section that has nothing in it:

## Task
What the user is trying to do, and any deadline or context that frames it.

## Decisions
Every choice that was settled, and the reason it was settled that way. Include choices that were rejected and why, so they are not proposed again.

## Facts and constraints
Names, values, versions, paths, URLs, identifiers, preferences, requirements. Verbatim where precision matters — an approximated identifier is worse than an absent one.

## Code and artifacts
Any code, command, configuration or text that was produced and is still in use. Keep it exactly as written, in fenced blocks. Summarise only what has since been superseded.

## State
What is done, what is in progress, and what is left.

## Open questions
Anything asked and not yet answered, or explicitly deferred.

Write in the language of the conversation. Be concise but never lossy: prefer a longer summary over a missing fact. Output only the summary — no preamble, no closing remark, no mention of these instructions.`
	},
	compactContext: {
		label: 'Compaction — use the summary',
		placeholders: ['{summary}'],
		hint: 'How the model treats a summary standing in for earlier messages.',
		default: `The conversation up to this point has been summarised to stay within your context window. The summary below replaces those earlier messages: it is the only record you have of them, and it is accurate. Treat it as things you and the user established together, and continue from it without restarting or re-asking what it already answers. If it does not cover something you need, say so and ask rather than inventing it.

{summary}`
	}
};

/** Order shown in the Settings dropdown. */
export const PROMPT_KEYS: PromptKey[] = [
	'currentDate',
	'searchRouter',
	'searchNone',
	'searchContext',
	'searchRecall',
	'searchRead',
	'pageContext',
	'interactiveChoices',
	'compact',
	'compactContext'
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
