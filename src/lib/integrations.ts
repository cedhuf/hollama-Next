/**
 * Bots living outside Llooma, and what each is configured to be.
 *
 * An integration is an account somewhere else that answers with a model from
 * here. The row carries a `kind` and a bag of settings, so the second one is a
 * new folder under `server/integrations/` and a new form, not a migration.
 *
 * Nothing is stored per conversation: the remote chat keeps the transcript, and
 * this side reads what it needs when it is called and forgets it.
 */

export const INTEGRATION_KINDS = ['chatto'] as const;

export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/**
 * How much of the surrounding conversation goes to the model. The remote server
 * does not decide this: a notification points at one message, and everything
 * around it is a request we choose to make. Its floor is real, `mention` being
 * the only mode that guarantees nothing else from the room is read.
 */
export type ContextDepth =
	/** The message that called the bot, and nothing else. */
	| 'mention'
	/** That message plus the few before it, which is what makes "@bot what do you think?" mean anything. */
	| 'recent'
	/** The whole thread it was called in, root included. */
	| 'thread';

/** `default` is what a conversation started here would get. The other two replace it rather than add to it, because a persona is a whole character. */
export type InstructionsMode = 'default' | 'persona' | 'custom';

/** Where the answer is posted, once it exists. */
export type Placement =
	/** In the thread when called from one, in the room otherwise. */
	| 'auto'
	/** Always in a thread, starting one when the call came from the room. */
	| 'thread'
	/** Always at room level, even when called inside a thread. */
	| 'room';

/**
 * The tools a bot may use. All but one: interactive choices draw buttons, and a
 * chat server that renders a message as text has nothing to draw them with.
 *
 * `mcp` is on the owner's say-so and behaves differently from everywhere else:
 * a bot has no person to put a call to, so ticking this accepts that its calls
 * run unasked, on the owner's servers, at the prompting of whoever is in the
 * room. Off by default, and it should stay a decision somebody took.
 */
export const BOT_TOOLS = ['webSearch', 'webFetch', 'sendCurrentDate', 'thinking', 'mcp'] as const;

export type BotTool = (typeof BOT_TOOLS)[number];

/**
 * How many bots one account may run, and how many answers an hour across all of
 * them, before an administrator says otherwise.
 *
 * The first is a physical bound: each bot is a timer and an open conversation
 * held in this process. The second is what a runaway costs, counted per account
 * because a per-bot ceiling is walked around by making a second bot.
 */
export const DEFAULT_BOTS_PER_USER = 5;
export const DEFAULT_BOT_REPLIES_PER_HOUR = 60;

/** What the form and the API agree an administrator may set them to. */
export const BOTS_PER_USER_MAX = 50;
export const BOT_REPLIES_PER_HOUR_MAX = 1000;

/** How many messages `recent` sends, and the bounds the form and the API agree on. */
export const CONTEXT_COUNT_DEFAULT = 6;
export const CONTEXT_COUNT_MIN = 1;
export const CONTEXT_COUNT_MAX = 40;

/** How often the remote server is asked whether anything happened. */
export const POLL_SECONDS_DEFAULT = 5;
export const POLL_SECONDS_MIN = 2;
export const POLL_SECONDS_MAX = 120;

export interface ChattoConfig {
	/** Where the Chatto server lives, without a trailing slash. */
	baseUrl: string;
	/** The connection the model is served from, resolved server-side like any run. */
	serverId: string;
	model: string;
	instructionsMode: InstructionsMode;
	/** A persona contributes its prompt and nothing else: no memory, no library conversation, no knowledge. */
	personaId?: string;
	/** The instructions, in `custom` mode. */
	instructions: string;
	placement: Placement;
	context: ContextDepth;
	contextCount: number;
	/** What the turn may reach for, limited by what the instance actually offers. */
	tools: BotTool[];
	pollSeconds: number;
}

/** The settings of one integration, by kind. One kind today, hence the alias. */
export type IntegrationConfig = ChattoConfig;

/** An integration as the browser is allowed to see it: never the credential. */
export interface IntegrationView {
	id: string;
	kind: IntegrationKind;
	label: string;
	/** What the owner wants. */
	enabled: boolean;
	/** An administrator suspends a bot with this rather than by turning the owner's switch off: a switch the owner can turn back on is a suggestion. */
	blocked: boolean;
	/** True when a credential is stored. Its value is never returned. */
	hasSecret: boolean;
	config: IntegrationConfig;
	createdAt: string;
}

export function defaultChattoConfig(): ChattoConfig {
	return {
		baseUrl: '',
		serverId: '',
		model: '',
		instructionsMode: 'default',
		instructions: '',
		placement: 'auto',
		context: 'recent',
		contextCount: CONTEXT_COUNT_DEFAULT,
		tools: ['sendCurrentDate'],
		pollSeconds: POLL_SECONDS_DEFAULT
	};
}

export function defaultConfig(kind: IntegrationKind): IntegrationConfig {
	switch (kind) {
		case 'chatto':
			return defaultChattoConfig();
	}
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Applied on the way in and out of the database, so a row written by an older version, or by curl, is still a configuration the runtime can act on. */
export function normaliseConfig(kind: IntegrationKind, raw: unknown): IntegrationConfig {
	const base = defaultConfig(kind);
	const input = (raw ?? {}) as Partial<ChattoConfig>;

	return {
		...base,
		baseUrl: (input.baseUrl ?? '').trim().replace(/\/+$/, ''),
		serverId: (input.serverId ?? '').trim(),
		model: (input.model ?? '').trim(),
		instructionsMode: oneOf(
			input.instructionsMode,
			['default', 'persona', 'custom'] as const,
			base.instructionsMode
		),
		personaId: input.personaId?.trim() || undefined,
		instructions: input.instructions ?? '',
		placement: oneOf(input.placement, ['auto', 'thread', 'room'] as const, base.placement),
		context: oneOf(input.context, ['mention', 'recent', 'thread'] as const, base.context),
		contextCount: clampNumber(
			input.contextCount,
			CONTEXT_COUNT_MIN,
			CONTEXT_COUNT_MAX,
			base.contextCount
		),
		tools: Array.isArray(input.tools)
			? BOT_TOOLS.filter((tool) => (input.tools as string[]).includes(tool))
			: base.tools,
		pollSeconds: clampNumber(
			input.pollSeconds,
			POLL_SECONDS_MIN,
			POLL_SECONDS_MAX,
			base.pollSeconds
		)
	};
}

/** Whether an integration holds enough to be worth starting. */
export function isRunnable(view: { config: IntegrationConfig; hasSecret: boolean }): boolean {
	const { baseUrl, serverId, model } = view.config;
	return !!baseUrl && !!serverId && !!model && view.hasSecret;
}
