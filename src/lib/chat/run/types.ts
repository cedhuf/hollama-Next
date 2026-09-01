import type { OllamaOptions } from '$lib/chat/ollama';
import type { McpApprovalRequest } from '$lib/mcp';
import type { Message, ReasoningStep, WebSearchInfo } from '$lib/sessions';

/**
 * What a turn is, said once, so it can be run anywhere.
 *
 * A generation used to be a method on a component: it read the stores around it
 * and died with the page, so a reload took the answer with it while the model
 * was still writing.
 *
 * The turn is data and what it produces is events, neither mentioning the
 * browser. The page is then a reducer over those events, which is what makes
 * reattaching after a reload nothing more than replaying the log.
 */

/** How eagerly to use the provider's own tool calling. The setting's own values. */
export type NativeToolsPreference = 'off' | 'auto' | 'force';

/**
 * One voice in a turn, when the turn has more than one.
 *
 * Calling a persona with `@` hands the turn to somebody else, with their model,
 * options, prompt and tools. A speaker carries the fields it overrides rather
 * than a persona id: the run has no library, and by the time it starts every
 * question about who is answering is settled.
 *
 * The ordinary turn is one speaker with no persona.
 */
export interface RunSpeaker {
	personaId: string;
	/** How the reply is attributed, on screen and in what later turns are sent. */
	name: string;
	/** Named rather than described: the server resolves the address and the key from its own database, so a browser never holds either. */
	serverId: string;
	model: string;
	options?: Partial<OllamaOptions>;
	think: boolean;
	/** Its own prompt, already framed by the one that says it was called into a conversation. */
	systemPrompt?: string;
	flags: RunFlags;
	capabilities: RunCapabilities;
}

/** The toggles the composer offers, for one message. */
export interface RunFlags {
	webSearch: boolean;
	webFetch: boolean;
	interactiveChoices: boolean;
	sendCurrentDate: boolean;
	nativeTools: NativeToolsPreference;
	/** On by default and per conversation. Off is not a refusal of the calls, it is not sending the catalogues: a turn that will never need forty tools should not pay for their definitions. */
	mcp: boolean;
	/** Let the model decide whether a search is worth it, in the text protocol. */
	webSearchAuto: boolean;
}

/** What each tool is actually able to do here, decided by config, not by hope. */
export interface RunCapabilities {
	search: boolean;
	fetch: boolean;
}

/** Everything a turn needs, resolved by the caller and settled before it starts. */
export interface RunInput {
	/** The conversation this belongs to, so a reattaching client can find its run. */
	sessionId: string;
	/** The connection to talk to. Named by id; the server resolves the rest. */
	serverId: string;
	model: string;
	options?: Partial<OllamaOptions>;
	/** Whether the model may reason. False never asks for it. */
	think: boolean;
	/** The session's own system prompt, already resolved. Empty means none. */
	systemPrompt?: string;
	/** Carried so a turn can find what this persona remembers about the account. Everything else about it is already resolved into the fields above. */
	personaId?: string;
	/**
	 * The conversation as the model should receive it: already cut back to the
	 * last compaction marker, still carrying its markers and images.
	 */
	messages: Message[];
	/** The toggles the composer offers, for this message only. */
	flags: RunFlags;
	capabilities: RunCapabilities;
	/** Empty or absent is the ordinary turn. Otherwise each entry answers in order and the conversation's assistant does not: naming somebody is choosing them. */
	speakers?: RunSpeaker[];
	/**
	 * Who is answering this particular pass, set by the driver rather than by the
	 * caller. It is what stamps the reply so a later turn can attribute it.
	 */
	speaker?: { personaId: string; name: string };
	/** On by default, which is what a conversation with several people is. Off gives each the same question and none of the others' answers. */
	sequential?: boolean;
	/** The user's prompt overrides, so the run resolves the same text the page would. */
	promptOverrides?: Record<string, string>;
	/** Set when this turn should also name the conversation once it lands. */
	title?: {
		model: string;
		serverId?: string;
	};
	/** Set when the conversation is due for compaction once this turn lands. */
	compact?: {
		model: string;
		serverId?: string;
		/** How many of the most recent messages to leave outside the summary. */
		keepRecent: number;
	};
}

/** Small and additive: a client that joins late replays the list and arrives where one that watched it live is. Anything that cannot be replayed does not belong here. */
export type RunEvent =
	/** Sent before anything that voice produces, including on an ordinary single-speaker turn, so a late client learns who is speaking by replaying. */
	| { type: 'speaker'; personaId?: string; name?: string }
	/** A fragment of the answer. */
	| { type: 'content'; text: string }
	/** A fragment of the model's reasoning for the round in progress. */
	| { type: 'thinking'; text: string }
	/** Sent rather than left to be guessed from a `trace`: the trace only carries reasoning worth keeping, and a round that thought about nothing still clears the panel. */
	| { type: 'round'; index: number }
	/** A finished step joins the timeline above the live reasoning. */
	| { type: 'trace'; step: ReasoningStep }
	/** Whether a lookup is in flight, and which kind, for the live indicator. */
	| { type: 'searching'; active: boolean; activity?: 'search' | 'read' | 'tool'; query?: string }
	/** An event rather than a question put to whoever started the turn, because the run outlives the tab. A late client replays it and finds the question standing; the answer goes back over its own route. */
	| { type: 'approval'; request: McpApprovalRequest }
	/** How that question ended, so every watching client stops asking it. */
	| {
			type: 'approvalResolved';
			id: string;
			allowed: boolean;
			by: 'user' | 'timeout' | 'aborted';
	  }
	/** What the turn has put in front of the model so far. */
	| { type: 'sources'; info: WebSearchInfo }
	/** The turn's answer, complete and ready to be appended to the conversation. */
	| { type: 'message'; message: Message }
	/** A title was written for the conversation. */
	| { type: 'title'; title: string }
	/** A summary is being written, which the conversation draws where it will land. */
	| { type: 'compacting'; active: boolean }
	/** The conversation was compacted, and this marker replaces what came before it. */
	| { type: 'compaction'; marker: Message; replacedCount: number }
	/** The turn is over. Nothing follows. */
	/** What the provider says the turn consumed, once, at the end. An event like everything else, so a reattaching client gets it on replay. */
	| {
			type: 'usage';
			used: { input: number; output: number };
			/**
			 * On the event rather than inferred from the run: a turn can have several
			 * voices, and reading the conversation's model would price a persona's answer
			 * at a rate that may not exist on that connection.
			 */
			model?: string;
			serverId?: string;
	  }
	| { type: 'done' }
	/** Cancellation is an ending like any other rather than an exception: a reattaching client has to be told why nothing more is coming. */
	| { type: 'error'; message: string; aborted: boolean };

/** An event with its place in the log, which is what resumption is addressed by. */
export interface SequencedRunEvent {
	id: number;
	event: RunEvent;
}

export type RunStatus = 'running' | 'done' | 'error' | 'aborted';

/** What a client is told about a run it has not been watching. */
export interface RunSummary {
	id: string;
	sessionId: string;
	status: RunStatus;
	startedAt: string;
	/** The id of the last event written, so a client knows what it is catching up to. */
	lastEventId: number;
}

/** True for the endings after which no further event will ever arrive. */
export function isFinal(status: RunStatus): boolean {
	return status !== 'running';
}
