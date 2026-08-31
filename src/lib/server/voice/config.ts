import { resolveChatDefaults } from '$lib/server/chatDefaultsResolver';
import { getItem, getSettings } from '$lib/server/db/collections';
import type { Session } from '$lib/sessions';
import type { Model, Settings } from '$lib/settings';

/**
 * What a spoken conversation needs before anybody opens their mouth.
 *
 * Three models, and the app has to know it has all three before it offers to
 * listen. Finding out by trying is how somebody speaks a whole sentence to a
 * microphone that was never going to be heard, or worse, gets an answer and only
 * then learns that nothing was ever going to read it out.
 *
 * Resolved here rather than in the browser, and that is the point of the file.
 * The old voice screen read the settings store and handed the server a model
 * name it had chosen itself; that was tolerable while every call went through a
 * route that checked the choice again. A socket is opened once and then trusted
 * for the length of a conversation, so what it is allowed to do is settled
 * before it exists, on the only side that can settle it.
 *
 * A snapshot, deliberately. Somebody who changes their voice halfway through a
 * conversation finishes that conversation in the voice it started in, which is
 * less surprising than a speaker changing mid-sentence, and it means nothing has
 * to re-read the settings on a path where there is no request to hang it off.
 */

/** A model, and the connection that serves it. Everything downstream needs both. */
export interface VoiceTarget {
	serverId: string;
	model: string;
}

export interface VoiceConfig {
	/** Turning what was said into words. */
	listen: VoiceTarget & {
		/** ISO 639-1, or empty to leave the model to work it out. */
		language: string;
	};
	/** Reading the answer back. */
	speak: VoiceTarget & { voice: string };
	/** Answering. The conversation's own model, or the account's default. */
	think: VoiceTarget;
}

/**
 * Which half of the exchange is not configured, said in the terms the settings
 * use, so a screen can name the tab somebody has to open.
 */
export type VoiceMissing = 'listen' | 'speak' | 'think';

export type VoiceResolution =
	{ ok: true; config: VoiceConfig } | { ok: false; missing: VoiceMissing[] };

/**
 * The connection serving a model, for this account.
 *
 * The server-side twin of the lookup the browser does in `voice.svelte.ts` and
 * `speech.svelte.ts`: a name is not enough to reach anything, and the catalogue
 * that turns it into an address is per account.
 *
 * A name with no entry answers nothing rather than guessing at a connection.
 * Models are removed, connections are deleted, and a setting outlives both.
 */
function connectionFor(
	models: Model[] | undefined,
	name: string | null | undefined
): string | null {
	if (!name) return null;
	return (models ?? []).find((entry) => entry.name === name)?.serverId ?? null;
}

/**
 * Everything a voice session runs on, or the list of what is missing.
 *
 * `sessionId` names the conversation being held, when it is one that already
 * exists: its model answers, rather than the account's default, because a
 * conversation started with one model and continued out loud in another is two
 * conversations wearing one title.
 */
export function resolveVoiceConfig(
	user: { id: string; role: string },
	sessionId: string | null
): VoiceResolution {
	const settings = getSettings(user.id);
	const defaults = resolveChatDefaults(settings, user.role === 'admin');
	const missing: VoiceMissing[] = [];

	// Transcription, which the administrator may have set up and shared: on most
	// instances they are the only person who could have.
	const listenModel = defaults.voice.voiceInput ? defaults.voice.voiceModel : '';
	const listenServer = connectionFor(settings?.models, listenModel);
	if (!listenServer) missing.push('listen');

	// Reading aloud is the account's own, and needs a voice by name as well as a
	// model: every one of these endpoints refuses without one.
	const speakModel = settings?.speechOutput ? settings.speechModel : null;
	const speakVoice = settings?.speechVoice?.trim() ?? '';
	const speakServer = speakVoice ? connectionFor(settings?.models, speakModel) : null;
	if (!speakServer) missing.push('speak');

	const think = thinkTarget(user.id, settings, defaults.defaultModel.value, sessionId);
	if (!think) missing.push('think');

	if (!listenServer || !speakServer || !think) return { ok: false, missing };

	return {
		ok: true,
		config: {
			listen: {
				serverId: listenServer,
				model: listenModel,
				language: settings?.voiceLanguage?.trim() ?? ''
			},
			speak: { serverId: speakServer, model: speakModel as string, voice: speakVoice },
			think
		}
	};
}

/** The model that answers: the conversation's own, or failing that the default. */
function thinkTarget(
	userId: string,
	settings: Settings | null,
	defaultModel: string,
	sessionId: string | null
): VoiceTarget | null {
	const stored = sessionId ? getItem<Session>('sessions', userId, sessionId) : null;
	// A stored conversation carries its connection with it, so it is taken whole
	// rather than looked up: the model may have since left the catalogue, and the
	// conversation is still being held on it.
	if (stored?.model?.serverId && stored.model.name) {
		return { serverId: stored.model.serverId, model: stored.model.name };
	}

	const server = connectionFor(settings?.models, defaultModel);
	return server ? { serverId: server, model: defaultModel } : null;
}
