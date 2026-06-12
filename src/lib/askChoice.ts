// Interactive quick-choice buttons.
//
// Like web search, this is NOT a native tool call (model/tool support is too
// uneven across the Ollama + OpenAI-compatible backends we target). Instead the
// model is instructed to emit a single <ask>…</ask> block when it wants to
// clarify a preference; we parse it out of the streamed reply — the same way
// reasoning <think> tags are handled — and render buttons. The user's selection
// becomes a normal `user` message, so the history stays clean and natural.

export type AskQuestionType = 'single_select' | 'multi_select';

export interface AskQuestion {
	question: string;
	type: AskQuestionType;
	options: string[];
}

export interface AskChoices {
	questions: AskQuestion[];
	/** Set once the user has picked, so the buttons render locked on reload. */
	answered?: boolean;
	/** The selected option(s) per question (parallel to `questions`). */
	selected?: string[][];
}

/** Instruction injected into the system prompt when the feature is enabled. */
export const ASK_INSTRUCTION = `# Interactive choices
When the user's request is genuinely ambiguous and hinges on a personal preference you cannot infer, you MAY ask for a quick choice instead of guessing. To do so, output a SINGLE block exactly like this and then STOP — write nothing before or after it:

<ask>
{"questions":[{"question":"...","type":"single_select","options":["...","..."]}]}
</ask>

Rules:
- At most 3 questions; each with 2 to 4 short options. "type" is "single_select" or "multi_select".
- Write the questions and options in the user's language.
- Use this ONLY to clarify a preference before carrying out a task (planning, recommendations, design choices, …).
- Do NOT use it for factual or direct questions, when the user already gave enough constraints, or when they are asking for YOUR opinion between options.
- When you use it, the block must be the entire message — no greeting, no explanation, no answer.`;

interface RawQuestion {
	question?: unknown;
	type?: unknown;
	options?: unknown;
}

function normalizeQuestions(raw: unknown): AskQuestion[] {
	if (!Array.isArray(raw)) return [];
	const questions: AskQuestion[] = [];
	for (const item of raw.slice(0, 3) as RawQuestion[]) {
		const question = typeof item?.question === 'string' ? item.question.trim() : '';
		const options = Array.isArray(item?.options)
			? item.options
					.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
					.slice(0, 4)
			: [];
		if (!question || options.length < 2) continue;
		const type: AskQuestionType = item?.type === 'multi_select' ? 'multi_select' : 'single_select';
		questions.push({ question, type, options });
	}
	return questions;
}

/**
 * Split a finished assistant reply into the visible text and, if present, the
 * structured quick-choice questions. Tolerant of an optional code fence inside
 * the block and of malformed JSON (falls back to plain text).
 */
export function parseAskBlock(raw: string): { content: string; choices?: AskChoices } {
	const match = raw.match(/<ask>\s*([\s\S]*?)<\/ask>/i);
	if (!match || match.index === undefined) return { content: raw };

	const before = raw.slice(0, match.index).trim();
	const json = match[1]
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```$/, '')
		.trim();

	try {
		const parsed = JSON.parse(json) as { questions?: unknown };
		const questions = normalizeQuestions(parsed?.questions);
		if (!questions.length) return { content: before || raw };
		return { content: before, choices: { questions } };
	} catch {
		return { content: before || raw };
	}
}

/**
 * While streaming we don't yet have a complete block — hide anything from the
 * opening tag onward so the raw JSON never flashes in the bubble.
 */
export function stripAskBlock(raw: string): string {
	const i = raw.search(/<ask\b/i);
	return (i === -1 ? raw : raw.slice(0, i)).trim();
}

/**
 * Build the self-describing `user` message sent after the user picks. Including
 * the question text keeps the choice unambiguous for the model even if its own
 * prior turn carried no visible text.
 */
export function formatAskAnswer(questions: AskQuestion[], selected: string[][]): string {
	const single = questions.length === 1;
	return questions
		.map((q, i) => {
			const answer = (selected[i] ?? []).join(', ');
			if (!answer) return '';
			return single ? answer : `${q.question}: ${answer}`;
		})
		.filter(Boolean)
		.join('\n');
}
