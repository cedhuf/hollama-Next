<script lang="ts">
	import { Code, Pencil, Type } from '@lucide/svelte';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { loadKnowledge, saveKnowledge } from '$lib/knowledge';
	import { knowledgeStore } from '$lib/localStorage';
	import { knowledgeDraft, knowledgeModalOpen } from '$lib/stores/modal';
	import { toast } from '$lib/toast';
	import { formatTimestampToNow, generateRandomId, getUpdatedAtDate } from '$lib/utils';

	import CodeEditor from './CodeEditor.svelte';
	import CollectionSelect from './CollectionSelect.svelte';
	import EditorModal from './EditorModal.svelte';

	/**
	 * Writing down a piece of knowledge, wherever you happen to be. One editor for
	 * both cases, opening prefilled, which is how a conversation becomes knowledge
	 * without a round trip through the clipboard.
	 *
	 * It writes as you type: behind a Save button, the cross, Escape and a click on
	 * the backdrop all threw the work away without a word.
	 */
	let id = $state('');
	let name = $state('');
	let content = $state('');
	let updatedAt = $state('');
	let collectionId = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);

	/** Kept across openings: whoever wants the code view usually wants it every time. */
	let view = $state<'text' | 'code'>('text');

	/** The collection is chosen rather than typed, so nothing fires an input event. Watched instead, and only once there is a record to move. */
	$effect(() => {
		void collectionId;
		if (updatedAt) persist();
	});

	const isNew = $derived(!updatedAt);
	// The same estimate the context meter uses, so its weight is stated in the units
	// the rest of the app talks about.
	const tokens = $derived(Math.ceil(content.length / 3.7));

	// Opening loads the draft, closing forgets it, so the next open is never last
	// time's text.
	$effect(() => {
		if (!$knowledgeModalOpen) return;
		const draft = $knowledgeDraft;
		const existing = draft.id ? loadKnowledge(draft.id) : null;

		id = draft.id ?? generateRandomId();
		name = draft.name ?? existing?.name ?? '';
		content = draft.content ?? existing?.content ?? '';
		collectionId = draft.collectionId ?? existing?.collectionId ?? '';
		updatedAt = existing?.updatedAt ?? '';

		void tick().then(() => {
			if (!name) nameInput?.focus();
		});
	});

	/** Nothing is stored until there is something to store: a document created by opening the dialog and closing it again would be a row nobody asked for. */
	function persist() {
		if (!name.trim() && !content.trim()) return;
		saveKnowledge({
			id,
			name: name.trim(),
			content,
			collectionId: collectionId || undefined,
			updatedAt: getUpdatedAtDate()
		});
		updatedAt = getUpdatedAtDate();
	}

	/** The plain `{ name, content }` shape `parseKnowledgeImport` accepts, so it goes into any library. No id and no collection: both mean something only where they came from. */
	function exportThis() {
		const data = JSON.stringify({ name, content }, null, 2);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name.trim() || 'knowledge'}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function remove() {
		knowledgeStore.remove(id);
		toast.info($LL.knowledgeDeleted());
		$knowledgeModalOpen = false;
	}
</script>

<EditorModal
	bind:open={$knowledgeModalOpen}
	title={name}
	placeholder={$LL.newKnowledge()}
	fill
	onExport={isNew ? undefined : exportThis}
	onDelete={isNew ? undefined : remove}
>
	<!-- The name reads as the title of the thing rather than a form field, and still
	     has to look typeable: a border only on hover says nothing on a phone. A
	     pencil and a dotted underline at rest, firming up on hover and focus. -->
	<div class="group relative">
		<input
			bind:this={nameInput}
			bind:value={name}
			oninput={persist}
			name="name"
			placeholder={$LL.knowledgeNamePlaceholder()}
			spellcheck="false"
			class="text-active decoration-shade-4 placeholder:text-muted hover:border-shade-3 focus:border-accent focus:bg-shade-0 -mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 pr-8 text-lg font-semibold decoration-dotted underline-offset-[6px] transition-colors outline-none placeholder:font-normal hover:no-underline focus:no-underline"
			class:underline={!!name}
		/>
		<Pencil
			class="text-muted pointer-events-none absolute top-1/2 right-0 h-3.5 w-3.5 -translate-y-1/2 opacity-60 transition-opacity group-focus-within:opacity-0"
		/>
	</div>

	<div class="flex items-center justify-between gap-3">
		<!-- Always there, including when no collection exists yet: the way to make the
		     first one is inside it. -->
		<CollectionSelect bind:value={collectionId} class="max-w-48" />

		<!-- Plain text is the default because most knowledge is prose; the code view is
		     for the ones that are a schema or a config. -->
		<div class="bg-shade-2 flex rounded-lg p-0.5 text-xs">
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
		<CodeEditor bind:value={content} onSubmit={persist} />
	{:else}
		<textarea
			bind:value={content}
			oninput={persist}
			placeholder={$LL.knowledgeContentPlaceholder()}
			class="border-shade-3 bg-shade-0 placeholder:text-muted focus:border-accent min-h-0 w-full flex-1 resize-none rounded-lg border p-3 text-sm leading-relaxed transition-colors outline-none"
		></textarea>
	{/if}

	<p class="text-muted flex items-center justify-between gap-3 text-xs">
		<span>{isNew ? $LL.knowledgeModalHint() : formatTimestampToNow(updatedAt)}</span>
		{#if content.trim()}
			<span class="tabular-nums">{$LL.knowledgeTokens({ tokens: tokens.toLocaleString() })}</span>
		{/if}
	</p>
</EditorModal>
