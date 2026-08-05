<script lang="ts">
	import { Brain, Code, Folder, Trash2, Type } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { loadKnowledge, saveKnowledge } from '$lib/knowledge';
	import { knowledgeStore, settingsStore } from '$lib/localStorage';
	import { knowledgeDraft, knowledgeModalOpen } from '$lib/stores/modal';
	import { formatTimestampToNow, generateRandomId, getUpdatedAtDate } from '$lib/utils';

	import Button from './Button.svelte';
	import CodeEditor from './CodeEditor.svelte';
	import Modal from './Modal.svelte';

	/**
	 * Writing down a knowledge collection, wherever you happen to be.
	 *
	 * One editor for both cases: a new collection and an existing one differ by
	 * whether the fields start empty, which is not enough to justify a second
	 * screen. It opens prefilled too, which is how a conversation becomes a
	 * collection without a round trip through the clipboard.
	 */
	let id = $state('');
	let name = $state('');
	let content = $state('');
	let updatedAt = $state('');
	let collectionId = $state('');
	let confirmingDelete = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);

	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	/** Kept across openings: whoever wants the code view usually wants it every time. */
	let view = $state<'text' | 'code'>('text');

	const isNew = $derived(!updatedAt);
	const canSave = $derived(!!name.trim() && !!content.trim());
	// Same estimate the context meter uses, so a collection's weight is stated in
	// the units the rest of the app talks about.
	const tokens = $derived(Math.ceil(content.length / 3.7));

	// Opening loads the draft; closing forgets it, so the next open is never last
	// time's text. Focus lands on the field with nothing in it.
	$effect(() => {
		if (!$knowledgeModalOpen) return;
		const draft = $knowledgeDraft;
		const existing = draft.id ? loadKnowledge(draft.id) : null;

		id = draft.id ?? generateRandomId();
		name = draft.name ?? existing?.name ?? '';
		content = draft.content ?? existing?.content ?? '';
		collectionId = draft.collectionId ?? existing?.collectionId ?? '';
		updatedAt = existing?.updatedAt ?? '';
		confirmingDelete = false;

		void tick().then(() => {
			if (!name) nameInput?.focus();
		});
	});

	function save() {
		if (!canSave) return;
		saveKnowledge({
			id,
			name: name.trim(),
			content,
			collectionId: collectionId || undefined,
			updatedAt: getUpdatedAtDate()
		});
		toast.success($LL.knowledgeSaved());
		$knowledgeModalOpen = false;
	}

	function remove() {
		knowledgeStore.remove(id);
		$knowledgeModalOpen = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			save();
		}
	}
</script>

<Modal bind:open={$knowledgeModalOpen}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form
		class="flex h-full w-full flex-col"
		onsubmit={(event) => {
			event.preventDefault();
			save();
		}}
		onkeydown={onKeydown}
	>
		<!-- Header: what this is, and when it was last touched. The close button the
		     dialog draws itself sits to the right of it, hence the padding. -->
		<header class="flex items-center gap-3 border-b border-shade-3 px-5 py-4 pr-14">
			<span
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-shade-2 text-muted"
				aria-hidden="true"
			>
				<Brain class="h-5 w-5" />
			</span>
			<div class="flex min-w-0 flex-col">
				<h2 class="text-sm font-semibold text-active">
					{isNew ? $LL.newKnowledge() : $LL.knowledge()}
				</h2>
				<p class="truncate text-xs text-muted">
					{isNew ? $LL.knowledgeModalHint() : formatTimestampToNow(updatedAt)}
				</p>
			</div>
		</header>

		<div class="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
			<!-- The name reads as the collection's title rather than as a form field,
			     but a title with nothing in it reads as a heading nobody can type in.
			     A border on hover and focus says otherwise without turning it back
			     into a box that sits there all day. -->
			<input
				bind:this={nameInput}
				bind:value={name}
				name="name"
				placeholder={$LL.knowledgeNamePlaceholder()}
				spellcheck="false"
				class="-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-active outline-none transition-colors placeholder:font-normal placeholder:text-muted hover:border-shade-3 focus:border-accent focus:bg-shade-0"
			/>

			<!-- Two ways to write the same field. Plain text is the default because
			     most knowledge is prose; the code view is for the ones that are a
			     schema or a config, where line numbers and a monospace grid are the
			     difference between readable and not. -->
			<div class="flex items-center justify-between gap-3">
				{#if collections.length}
					<label class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
						<Folder class="h-3.5 w-3.5 shrink-0" />
						<select
							bind:value={collectionId}
							class="min-w-0 max-w-48 truncate rounded-md border border-shade-3 bg-shade-0 px-2 py-1 text-xs text-active outline-none focus:border-accent"
						>
							<option value="">{$LL.noCollection()}</option>
							{#each collections as collection (collection.id)}
								<option value={collection.id}>{collection.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<span></span>
				{/if}

				<div class="flex rounded-lg bg-shade-2 p-0.5 text-xs">
					{#each [{ id: 'text', label: $LL.editorPlain(), icon: Type }, { id: 'code', label: $LL.editorCode(), icon: Code }] as tab (tab.id)}
						{@const Icon = tab.icon}
						<button
							type="button"
							onclick={() => (view = tab.id as 'text' | 'code')}
							aria-pressed={view === tab.id}
							class="flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors {view ===
							tab.id
								? 'bg-shade-0 text-active shadow-sm'
								: 'text-muted hover:text-active'}"
						>
							<Icon class="h-3.5 w-3.5" />
							{tab.label}
						</button>
					{/each}
				</div>
			</div>

			{#if view === 'code'}
				<CodeEditor bind:value={content} onSubmit={save} />
			{:else}
				<textarea
					bind:value={content}
					placeholder={$LL.knowledgeContentPlaceholder()}
					class="min-h-0 w-full flex-1 resize-none rounded-lg border border-shade-3 bg-shade-0 p-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted focus:border-accent"
				></textarea>
			{/if}
		</div>

		<footer class="flex items-center gap-2 border-t border-shade-3 px-5 py-3">
			{#if !isNew}
				<!-- Two steps, in place: a dialog that closes behind a deletion gives
				     nowhere to change your mind. -->
				{#if confirmingDelete}
					<Button variant="outline" class="text-negative" onclick={remove}>
						{$LL.confirmDeletion()}
					</Button>
					<Button variant="outline" onclick={() => (confirmingDelete = false)}>
						{$LL.cancel()}
					</Button>
				{:else}
					<Button
						variant="icon"
						title={$LL.deleteKnowledge()}
						aria-label={$LL.deleteKnowledge()}
						class="hover:text-negative"
						onclick={() => (confirmingDelete = true)}
					>
						<Trash2 class="base-icon" />
					</Button>
				{/if}
			{/if}

			{#if content.trim()}
				<span class="text-xs tabular-nums text-muted">
					{$LL.knowledgeTokens({ tokens: tokens.toLocaleString() })}
				</span>
			{/if}

			<div class="ml-auto flex items-center gap-2">
				<Button variant="outline" onclick={() => ($knowledgeModalOpen = false)}>
					{$LL.cancel()}
				</Button>
				<Button {...{ type: 'submit' }} disabled={!canSave}>{$LL.save()}</Button>
			</div>
		</footer>
	</form>
</Modal>
