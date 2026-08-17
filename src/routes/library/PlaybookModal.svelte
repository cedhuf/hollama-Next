<script lang="ts">
	import { Trash2, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { PERSONA_GLYPHS } from '$lib/personaGlyphs';
	import { deletePlaybook, PLAYBOOK_COLORS, savePlaybook, type Playbook } from '$lib/playbooks';

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

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">
				{playbook.name.trim() || $LL.newPlaybook()}
			</span>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label="Close"
				class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-auto p-4">
			<div class="mx-auto flex w-full max-w-[70ch] flex-col gap-6">
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

						<!-- Colour and mark together on one row: they are the same decision,
						     which is what this looks like in a list of thirty. -->
						<SettingsField label={$LL.playbookMark()}>
							<div class="flex flex-col gap-2">
								<div class="flex flex-wrap gap-2">
									{#each PLAYBOOK_COLORS as color (color)}
										<button
											type="button"
											aria-label={color}
											onclick={() => {
												playbook.color = color;
												persist();
											}}
											class="h-7 w-7 rounded-lg ring-2 ring-offset-2 ring-offset-shade-0 transition-all {playbook.color ===
											color
												? 'ring-accent'
												: 'ring-transparent hover:ring-shade-4'}"
											style="background-color:{color}"
										></button>
									{/each}
								</div>

								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										onclick={() => {
											playbook.glyph = undefined;
											persist();
										}}
										class="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-shade-0 ring-2 ring-offset-2 ring-offset-shade-0 transition-all {playbook.glyph
											? 'ring-transparent hover:ring-shade-4'
											: 'ring-accent'}"
										style="background-color:{playbook.color}"
									>
										{(playbook.name.trim()[0] ?? '?').toUpperCase()}
									</button>
									{#each PERSONA_GLYPHS as option (option.id)}
										<button
											type="button"
											title={option.label}
											aria-label={option.label}
											onclick={() => {
												playbook.glyph = option.id;
												persist();
											}}
											class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg text-shade-0 ring-2 ring-offset-2 ring-offset-shade-0 transition-all {playbook.glyph ===
											option.id
												? 'ring-accent'
												: 'ring-transparent hover:ring-shade-4'}"
											style="background-color:{playbook.color};--persona-glyph-cut:{playbook.color}"
										>
											<svg viewBox="0 0 64 64" class="h-full w-full" role="presentation">
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												{@html option.body}
											</svg>
										</button>
									{/each}
								</div>
							</div>
						</SettingsField>
					</div>
				</SettingsSection>

				<SettingsSection
					title={$LL.playbookInstructions()}
					description={$LL.playbookInstructionsHelp()}
					card
				>
					<textarea
						class="settings-field min-h-[45vh] resize-y font-mono text-xs leading-relaxed"
						bind:value={playbook.instructions}
						oninput={persist}
						placeholder={$LL.playbookInstructionsPlaceholder()}
					></textarea>
				</SettingsSection>

				<button
					type="button"
					onclick={remove}
					class="flex items-center gap-2 self-start text-sm text-muted transition-colors hover:text-warning"
				>
					<Trash2 class="h-4 w-4" />
					{$LL.deletePlaybook()}
				</button>
			</div>
		</div>
	</div>
</Modal>
