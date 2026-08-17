<script lang="ts">
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import EditorModal from '$lib/components/EditorModal.svelte';
	import { deletePlaybook, savePlaybook, type Playbook } from '$lib/playbooks';

	import SettingsField from '../settings/SettingsField.svelte';
	import SettingsSection from '../settings/SettingsSection.svelte';

	/**
	 * Writing a procedure.
	 *
	 * Shaped around what a playbook is, which is one long piece of text plus the
	 * few things needed to find it again. So the editor is mostly the text: the
	 * identity fields are a strip at the top rather than a section of their own,
	 * and the instructions get the rest of the height. A persona's editor is the
	 * opposite shape because a persona is mostly settings.
	 */
	interface Props {
		open: boolean;
		playbook: Playbook;
	}

	let { open = $bindable(false), playbook = $bindable() }: Props = $props();

	function persist() {
		if (!playbook.name.trim()) return;
		savePlaybook(playbook);
	}

	/**
	 * What leaves is a bundle, not the stored record.
	 *
	 * The same file the store serves, so a playbook exported here installs
	 * anywhere: no id, no provenance, no trace of the library it came out of.
	 */
	function exportThis() {
		const bundle = {
			format: 'llooma.playbook',
			version: 1,
			id: playbook.name
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, ''),
			revision: 1,
			playbook: {
				name: playbook.name,
				summary: playbook.summary,
				instructions: playbook.instructions,
				tags: playbook.tags
			}
		};
		const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${playbook.name.trim() || 'playbook'}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function remove() {
		if (!confirm($LL.areYouSureYouWantToDeleteThisPlaybook())) return;
		deletePlaybook(playbook.id);
		toast.info($LL.playbookDeleted());
		open = false;
	}

	const tagsText = $derived((playbook.tags ?? []).join(', '));

	function setTags(value: string) {
		const tags = value
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
		playbook.tags = tags.length ? tags : undefined;
		persist();
	}
</script>

<EditorModal
	bind:open
	title={playbook.name}
	placeholder={$LL.newPlaybook()}
	onExport={exportThis}
	onDelete={remove}
>
	<SettingsSection title={$LL.playbookIdentity()} card>
		<div class="flex flex-col gap-3">
			<input
				class="settings-field"
				bind:value={playbook.name}
				oninput={persist}
				placeholder={$LL.playbookNamePlaceholder()}
			/>
			<SettingsField label={$LL.playbookSummary()} hint={$LL.playbookSummaryHelp()}>
				<input
					class="settings-field"
					bind:value={playbook.summary}
					oninput={persist}
					placeholder={$LL.playbookSummaryPlaceholder()}
				/>
			</SettingsField>

			<SettingsField label={$LL.playbookTags()} hint={$LL.playbookTagsHelp()}>
				<input
					class="settings-field"
					value={tagsText}
					oninput={(event) => setTags(event.currentTarget.value)}
					placeholder="cooking, weekly"
				/>
			</SettingsField>
		</div>
	</SettingsSection>

	<SettingsSection
		title={$LL.playbookInstructions()}
		description={$LL.playbookInstructionsHelp()}
		card
	>
		<textarea
			class="settings-field field-grow min-h-[24rem] font-mono text-xs leading-relaxed"
			bind:value={playbook.instructions}
			oninput={persist}
			placeholder={$LL.playbookInstructionsPlaceholder()}
		></textarea>
	</SettingsSection>
</EditorModal>
