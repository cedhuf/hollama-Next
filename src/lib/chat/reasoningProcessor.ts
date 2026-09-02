export type TagPair = {
	openTag: string;
	closeTag: string;
};

export type TagState = {
	tagPair: TagPair;
	content: string;
};

export const THOUGHT_TAG = '<thought>';
export const END_THOUGHT_TAG = '</thought>';
export const THINK_TAG = '<think>';
export const END_THINK_TAG = '</think>';

export const REASONING_TAGS: TagPair[] = [
	{ openTag: THOUGHT_TAG, closeTag: END_THOUGHT_TAG },
	{ openTag: THINK_TAG, closeTag: END_THINK_TAG }
];

enum ParserState {
	DEFAULT, // Processing normal text
	TAG_START, // Found '<'
	OPENING_TAG, // Building a possible opening tag
	INSIDE_REASONING, // Inside a reasoning tag
	CLOSING_TAG_START, // Found '<' inside reasoning
	CLOSING_TAG // Building a possible closing tag
}

/** FSM over streamed content, splitting inline reasoning tags out of the answer. */
export class ReasoningProcessor {
	private state = ParserState.DEFAULT;
	private completionBuffer = '';
	private reasoningBuffer = '';
	private tagBuffer = '';
	private currentTagPair: TagPair | null = null;
	private updateCompletion: (text: string) => void;
	private updateReasoning: (text: string) => void;

	constructor(updateCompletion: (text: string) => void, updateReasoning: (text: string) => void) {
		this.updateCompletion = updateCompletion;
		this.updateReasoning = updateReasoning;
	}

	processChunk(chunk: string): void {
		for (let i = 0; i < chunk.length; i++) {
			this.processChar(chunk[i]);
		}

		this.flushBuffers();
	}

	private processChar(char: string): void {
		const MAX_BUFFER_SIZE = 100;

		switch (this.state) {
			case ParserState.DEFAULT:
				if (char === '<') {
					this.state = ParserState.TAG_START;
					this.tagBuffer = '<';
				} else {
					this.completionBuffer += char;
					if (this.completionBuffer.length >= MAX_BUFFER_SIZE) {
						this.updateCompletion(this.completionBuffer);
						this.completionBuffer = '';
					}
				}
				break;

			case ParserState.TAG_START:
				this.tagBuffer += char;

				if (char === '/') {
					// A closing tag outside reasoning mode is regular text.
					this.completionBuffer += this.tagBuffer;
					this.tagBuffer = '';
					this.state = ParserState.DEFAULT;
				} else {
					this.state = ParserState.OPENING_TAG;
				}
				break;

			case ParserState.OPENING_TAG:
				this.tagBuffer += char;

				for (const tagPair of REASONING_TAGS) {
					if (this.tagBuffer === tagPair.openTag) {
						this.currentTagPair = tagPair;
						this.state = ParserState.INSIDE_REASONING;
						this.tagBuffer = '';

						if (this.completionBuffer.length > 0) {
							this.updateCompletion(this.completionBuffer);
							this.completionBuffer = '';
						}
						return;
					}
				}

				// Longer than the longest tag, so it is not one.
				if (this.tagBuffer.length > 10) {
					this.completionBuffer += this.tagBuffer;
					this.tagBuffer = '';
					this.state = ParserState.DEFAULT;
				}
				break;

			case ParserState.INSIDE_REASONING:
				if (char === '<') {
					this.state = ParserState.CLOSING_TAG_START;
					this.tagBuffer = '<';
				} else {
					this.reasoningBuffer += char;
					if (this.reasoningBuffer.length >= MAX_BUFFER_SIZE) {
						this.updateReasoning(this.reasoningBuffer);
						this.reasoningBuffer = '';
					}
				}
				break;

			case ParserState.CLOSING_TAG_START:
				this.tagBuffer += char;

				if (char === '/') {
					this.state = ParserState.CLOSING_TAG;
				} else {
					this.reasoningBuffer += this.tagBuffer;
					this.tagBuffer = '';
					this.state = ParserState.INSIDE_REASONING;
				}
				break;

			case ParserState.CLOSING_TAG:
				this.tagBuffer += char;

				if (this.currentTagPair && this.tagBuffer === this.currentTagPair.closeTag) {
					if (this.reasoningBuffer.length > 0) {
						this.updateReasoning(this.reasoningBuffer);
						this.reasoningBuffer = '';
					}

					this.tagBuffer = '';
					this.currentTagPair = null;
					this.state = ParserState.DEFAULT;
				} else if (this.tagBuffer.length > 10) {
					// Longer than the longest tag, so it is reasoning content.
					this.reasoningBuffer += this.tagBuffer;
					this.tagBuffer = '';
					this.state = ParserState.INSIDE_REASONING;
				}
				break;
		}
	}

	private flushBuffers(): void {
		if (this.completionBuffer.length > 0) {
			this.updateCompletion(this.completionBuffer);
			this.completionBuffer = '';
		}

		// The reasoning buffer too, for the incremental updates.
		if (this.reasoningBuffer.length > 0) {
			this.updateReasoning(this.reasoningBuffer);
			this.reasoningBuffer = '';
		}
	}

	/** Whatever is left when the stream ends. */
	finalize(): void {
		if (this.completionBuffer.length > 0) {
			this.updateCompletion(this.completionBuffer);
			this.completionBuffer = '';
		}

		if (this.reasoningBuffer.length > 0) {
			this.updateReasoning(this.reasoningBuffer);
			this.reasoningBuffer = '';
		}

		// A half-written tag at the end is regular text, on whichever side we were.
		if (this.tagBuffer.length > 0) {
			if (
				this.state === ParserState.INSIDE_REASONING ||
				this.state === ParserState.CLOSING_TAG_START ||
				this.state === ParserState.CLOSING_TAG
			) {
				this.updateReasoning(this.tagBuffer);
			} else {
				this.updateCompletion(this.tagBuffer);
			}
			this.tagBuffer = '';
		}
	}
}

export function createReasoningProcessor(
	updateCompletion: (text: string) => void,
	updateReasoning: (text: string) => void
): {
	processChunk: (chunk: string) => void;
	finalize: () => void;
} {
	const processor = new ReasoningProcessor(updateCompletion, updateReasoning);

	return {
		processChunk: (chunk: string) => processor.processChunk(chunk),
		finalize: () => processor.finalize()
	};
}
