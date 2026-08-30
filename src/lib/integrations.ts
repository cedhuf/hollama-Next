/**
 * Bots living outside Llooma, and what each of them is configured to be.
 *
 * An integration is an account somewhere else that answers with a model from
 * here. Chatto is the first, and the shape below is deliberately not built
 * around it: the row carries a `kind` and a bag of settings, so the second one
 * is a new folder under `server/integrations/` and a new form, not a migration.
 *
 * Nothing in here is stored per conversation. The remote chat keeps the
 * transcript, this side reads what it needs at the moment it is called and
 * forgets it afterwards, which is the reason there is no session, no history
 * and no compaction anywhere near this feature.
 */

export const INTEGRATION_KINDS = ['chatto'] as const;

export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/**
 * How much of the surrounding conversation goes to the model.
 *
 * The remote server does not decide this: a notification carries an exact
 * pointer to one message, and everything around it is a request we choose to
 * make. So it is a setting, and its floor is real: `mention` sends the single
 * message that called the bot, which is the only mode that guarantees nothing
 * else from the room is read.
 */
export type ContextDepth =
	/** The message that called the bot, and nothing else. */
	| 'mention'
	/** That message plus the few before it, which is what makes "@bot what do you think?" mean anything. */
	| 'recent'
	/** The whole thread it was called in, root included. */
	| 'thread';

/**
 * Where the bot's instructions come from.
 *
 * `default` is what a conversation started here would get, which is the honest
 * default: a bot with no instructions at all is a different assistant from the
 * one this account talks to every day. The other two replace it rather than add
 * to it, because a persona is a whole character and not a modifier.
 */
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
 * The tools a bot may use, out of the ones the composer offers.
 *
 * Four of the five, and the missing one is deliberate: interactive choices draw
 * buttons, and a chat server that renders a message as text has nothing to draw
 * them with. Offering it would be offering something that cannot work.
 */
export const BOT_TOOLS = ['webSearch', 'webFetch', 'sendCurrentDate', 'thinking'] as const;

export type BotTool = (typeof BOT_TOOLS)[number];

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
	/**
	 * Who the bot is, in `persona` mode.
	 *
	 * A persona contributes its prompt and nothing else: no memory, no library
	 * conversation, no knowledge. It is a way to reuse a personality that already
	 * exists, not a way to give the bot a life of its own here.
	 */
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
	enabled: boolean;
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

/**
 * What was sent, read as what it is allowed to be.
 *
 * Applied on the way in and on the way out of the database, so a row written by
 * an older version, or by somebody with curl, is still a configuration the
 * runtime can act on without checking every field again at every use.
 */
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
