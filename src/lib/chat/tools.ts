/**
 * Whether this turn is driven by native tool calling.
 *
 * The app has two ways to give a model the web: text protocols it answers with
 * (`<read>` blocks, plus a router pre-pass that decides on searching for it), and
 * native tool calls the provider transports as structured fields. The text path
 * is the one that works on every endpoint, so it stays the default and the
 * fallback; native is opted into.
 *
 * Deciding is deliberately conservative. Offering tools to a model that cannot
 * call them is not a clean failure: it improvises, and the user reads a reply with
 * a JSON blob in it, or a claim that it searched when nothing was called.
 */
import { ConnectionType, supportsNativeTools, type Server } from '$lib/connections';

import { OllamaStrategy } from './ollama';

export type NativeToolsSetting = 'off' | 'auto' | 'force';

export async function useNativeTools(
	server: Server,
	model: string,
	setting: NativeToolsSetting
): Promise<boolean> {
	if (setting === 'off') return false;
	// The user asserting support for an endpoint that has no way to advertise it.
	// Taken at their word, including for Ollama: they may know a model handles
	// tools despite an older daemon not listing the capability.
	if (setting === 'force') return true;

	// Ollama answers per model, which is the finest-grained answer available
	// anywhere and the reason no per-model setting is needed for it.
	if (server.connectionType === ConnectionType.Ollama) {
		return new OllamaStrategy(server).supportsTools(model);
	}

	return supportsNativeTools(server.connectionType);
}
