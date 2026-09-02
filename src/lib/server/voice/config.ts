import { resolveChatDefaults } from '$lib/server/chatDefaultsResolver';
import { getItem, getSettings } from '$lib/server/db/collections';
import type { Session } from '$lib/sessions';
import type { Model, Settings } from '$lib/settings';

/**
 * What a spoken conversation needs before anybody opens their mouth.
 *
 * Three models, and the app has to know it has all three before it offers to
 * listen: finding out by trying is how somebody speaks a whole sentence to a
 * microphone that was never going to be heard.
 *
 * Resolved here rather than in the browser: a socket is opened once and trusted
 * for a whole conversation, so what it may do is settled before it exists. A
 * snapshot, so a voice changed halfway through finishes as it started.
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

/** Which half is not configured, in the terms the settings use, so a screen can name the tab somebody has to open. */
export type VoiceMissing = 'listen' | 'speak' | 'think';

export type VoiceResolution =
	{ ok: true; config: VoiceConfig } | { ok: false; missing: VoiceMissing[] };

/**
 * The server-side twin of the lookup the browser does: a name is not enough to
 * reach anything, and the catalogue that turns it into an address is per
 * account. A name with no entry answers nothing rather than guessing.
 */
function connectionFor(
	models: Model[] | undefined,
	name: string | null | undefined
): string | null {
	if (!name) return null;
	return (models ?? []).find((entry) => entry.name === name)?.serverId ?? null;
}

/** `sessionId` names the conversation being held: its model answers rather than the account's default, since a conversation started with one model and continued in another is two conversations wearing one title. */
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
	// A stored conversation carries its connection with it, so it is taken whole:
	// the model may have left the catalogue, and the conversation is still held on it.
	if (stored?.model?.serverId && stored.model.name) {
		return { serverId: stored.model.serverId, model: stored.model.name };
	}

	const server = connectionFor(settings?.models, defaultModel);
	return server ? { serverId: server, model: defaultModel } : null;
}
