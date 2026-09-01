// Interactive quick-choice buttons.
//
// Not a native tool call: support is too uneven across the Ollama and
// OpenAI-compatible backends. The model is instructed to emit one <ask>…</ask>
// block, parsed out of the streamed reply the way <think> tags are, and the
// selection becomes a normal `user` message so the history stays natural.

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
 * The whole objects out of a broken one: a bracket in the wrong place makes the
 * entire block unparseable, well-formed questions included, so this walks the
 * text and collects every balanced `{…}` that parses on its own.
 *
 * Deliberately not a repair: counting brackets and appending the missing ones
 * guesses at what the model meant, which is worse than one question fewer.
 */
function salvageQuestions(json: string): unknown[] {
	const found: unknown[] = [];
	const starts: number[] = [];
	let inString = false;
	let escaped = false;

	for (let i = 0; i < json.length; i++) {
		const character = json[i];

		if (inString) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}

		if (character === '"') inString = true;
		else if (character === '{') starts.push(i);
		else if (character === '}') {
			// Every closer, at every depth: the questions are nested inside an object the
			// break usually leaves open, so waiting for the outer one would collect nothing.
			const from = starts.pop();
			if (from === undefined) continue;
			try {
				const value = JSON.parse(json.slice(from, i + 1));
				if (value && typeof (value as { question?: unknown }).question === 'string') {
					found.push(value);
				}
			} catch {
				// One malformed object among several is not a reason to stop reading.
			}
		}
	}

	return found;
}

/** Tolerant of a code fence inside the block and of malformed JSON: what can be read is read, and what cannot is dropped rather than shown. */
export function parseAskBlock(raw: string): { content: string; choices?: AskChoices } {
	const match = raw.match(/<ask>\s*([\s\S]*?)<\/ask>/i);
	if (!match || match.index === undefined) return { content: raw };

	const before = raw.slice(0, match.index).trim();
	const json = match[1]
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```$/, '')
		.trim();

	let questions: AskQuestion[];
	try {
		const parsed = JSON.parse(json) as { questions?: unknown };
		questions = normalizeQuestions(parsed?.questions);
	} catch {
		// Broken, but not worthless: keep the questions that are whole.
		questions = normalizeQuestions(salvageQuestions(json));
	}

	// Never the raw block. It used to fall back to the whole reply, which put a page
	// of JSON in front of somebody who had asked for a quiz.
	return questions.length ? { content: before, choices: { questions } } : { content: before };
}

/** While streaming there is no complete block yet: hide everything from the opening tag on, so the raw JSON never flashes in the bubble. */
export function stripAskBlock(raw: string): string {
	const i = raw.search(/<ask\b/i);
	return (i === -1 ? raw : raw.slice(0, i)).trim();
}

/** The assistant turn's content when it emitted only the <ask> block: some providers reject an assistant message with empty content, and this keeps the model's own context about what it asked. */
export function askChoicesToText(choices: AskChoices): string {
	return choices.questions.map((q) => q.question).join('\n');
}

/** Including the question text keeps the choice unambiguous for the model even when its own prior turn carried no visible text. */
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
