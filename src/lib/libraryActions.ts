import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { confirmAction } from '$lib/components/ConfirmDialog.svelte';
import { parseKnowledgeImport, saveKnowledge } from '$lib/knowledge';
import { applyBundleToPersona, installPersonaBundle, parsePersonaBundle } from '$lib/personaBundle';
import { fetchBundle } from '$lib/personaCatalog';
import { parsePersonasImport, savePersona, type Persona } from '$lib/personas';
import { personaState } from '$lib/personaState';
import type { CatalogEntry } from '$lib/personaStore';
import { installPlaybookBundle } from '$lib/playbookCatalog';
import { parsePlaybookBundle } from '$lib/playbookStore';
import { toast } from '$lib/toast';
import { generateRandomId } from '$lib/utils';

/**
 * The two things a library does that are not drawing a list.
 *
 * Here rather than in a page because there are two pages: the full interface's
 * Library and the phone's. They are the same act reached from two shapes, and
 * the day one of them learned a new format alone would be the day they stopped
 * agreeing about what a library holds.
 */

/**
 * One Import, which reads the files rather than asking what is in them. Three
 * menu entries opened the same picker and then failed on the wrong kind, which
 * is a quiz about a format nobody memorises.
 *
 * Anything that is not JSON is a document. It reports for itself, so the summary
 * is the same sentence whichever interface asked.
 */
export async function importLibraryFiles(files: File[]): Promise<void> {
	if (!files.length) return;
	const $LL = get(LL);

	let personas = 0;
	let playbooks = 0;
	let documents = 0;
	let failed = 0;

	for (const file of files) {
		const text = await file.text();
		const json = parseJson(text);

		if (json === undefined) {
			// Not JSON, so it is what it looks like: a document.
			saveKnowledge({
				id: generateRandomId(),
				name: file.name.replace(/\.[^.]+$/, ''),
				content: text,
				updatedAt: new Date().toISOString()
			});
			documents += 1;
			continue;
		}

		for (const item of Array.isArray(json) ? json : [json]) {
			const personaBundle = parsePersonaBundle(item);
			if (personaBundle) {
				installPersonaBundle(personaBundle, { origin: 'file' });
				personas += 1;
				continue;
			}

			const playbookBundle = parsePlaybookBundle(item);
			if (playbookBundle) {
				installPlaybookBundle(playbookBundle, { origin: 'file' });
				playbooks += 1;
				continue;
			}

			// Native and OpenWebUI personas, recognised by their fields rather than by a
			// format line.
			const native = parsePersonasImport(item);
			if (native.length) {
				for (const persona of native) savePersona(persona);
				personas += native.length;
				continue;
			}

			const knowledge = parseKnowledgeImport(item);
			if (!knowledge.length) {
				failed += 1;
				continue;
			}
			for (const document of knowledge) saveKnowledge(document);
			documents += knowledge.length;
		}
	}

	const summary = [
		personas ? $LL.importedPersonas({ count: personas }) : '',
		playbooks ? $LL.importedPlaybooks({ count: playbooks }) : '',
		documents ? $LL.importedCollections({ count: documents }) : ''
	].filter(Boolean);

	if (!summary.length) {
		toast.error($LL.nothingImportable());
		return;
	}
	toast.success(summary.join(' · '), {
		description: failed ? $LL.importSkipped({ count: failed }) : undefined
	});
}

/** `undefined` rather than a throw, so "is this JSON" is a question with an answer. */
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Take the published version back, over a copy that has been changed.
 *
 * Reachable wherever the persona is drawn, not only from the store: a user who
 * is not an administrator has no "my personas" view, so a card in their own
 * library is the only place their copy exists.
 *
 * The confirmation is asked only when there is something to lose: a copy merely
 * out of date is being brought forward, which is what its badge invited.
 */
export async function restorePersonaFromStore(
	persona: Persona,
	entry: CatalogEntry
): Promise<void> {
	const $LL = get(LL);

	if (
		personaState(persona, entry.contentDigest) !== 'outdated' &&
		!(await confirmAction({
			title: $LL.personaStoreUpdateConfirm({ name: persona.name }),
			action: $LL.personaStoreUpdate()
		}))
	) {
		return;
	}

	try {
		const bundle = await fetchBundle(entry);
		applyBundleToPersona(persona, bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.personaStoreUpdated({ name: entry.name }));
	} catch (error) {
		toast.error($LL.personaStoreInstallFailed(), {
			description: error instanceof Error ? error.message : undefined
		});
	}
}
