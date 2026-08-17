<script lang="ts">
	import { Code, Pencil, Type } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { loadKnowledge, saveKnowledge } from '$lib/knowledge';
	import { knowledgeStore } from '$lib/localStorage';
	import { knowledgeDraft, knowledgeModalOpen } from '$lib/stores/modal';
	import { formatTimestampToNow, generateRandomId, getUpdatedAtDate } from '$lib/utils';

	import CodeEditor from './CodeEditor.svelte';
	import CollectionSelect from './CollectionSelect.svelte';
	import EditorModal from './EditorModal.svelte';

	/**
	 * Writing down a piece of knowledge, wherever you happen to be.
	 *
	 * One editor for both cases: a new one and an existing one differ by whether
	 * the fields start empty, which is not enough to justify a second screen. It
	 * opens prefilled too, which is how a conversation becomes knowledge without a
	 * round trip through the clipboard.
	 *
	 * It writes as you type, like every other editor in the app, and that is a
	 * repair rather than a preference. It used to hold a draft behind a Save
	 * button, which meant the cross, Escape and a click on the backdrop all threw
	 * the work away without a word — three of the four ways out of a dialog. A
	 * draft model has to guard every exit to be worth anything, and this one
	 * guarded none.
	 */
	let id = $state('');
	let name = $state('');
	let content = $state('');
	let updatedAt = $state('');
	let collectionId = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);

	/** Kept across openings: whoever wants the code view usually wants it every time. */
	let view = $state<'text' | 'code'>('text');

	/**
	 * The collection is chosen rather than typed, so nothing fires an input event
	 * on it. Watched instead, and only once there is a record to move: without the
	 * guard, opening the dialog would write an empty document before a key is
	 * pressed.
	 */
	$effect(() => {
		void collectionId;
		if (updatedAt) persist();
	});

	const isNew = $derived(!updatedAt);
	// Same estimate the context meter uses, so its weight is stated in
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

		void tick().then(() => {
			if (!name) nameInput?.focus();
		});
	});

	/**
	 * Write it down, as it is written.
	 *
	 * Nothing is stored until there is something to store: an empty document
	 * created by opening the dialog and closing it again would be a row nobody
	 * asked for, in a list nobody wants to tidy.
	 */
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

	/**
	 * A document, as a file the import reads back.
	 *
	 * The plain `{ name, content }` shape `parseKnowledgeImport` accepts, so what
	 * leaves here goes into any library, including someone else's. No id and no
	 * collection: both mean something only where they came from.
	 */
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
		if (!confirm($LL.areYouSureYouWantToDeleteThisKnowledge())) return;
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
	<!-- The name reads as the title of the thing rather than as a form field. It
	     still has to look typeable, though: a heading with a border only on hover
	     says nothing on a phone, and says nothing to anyone who does not happen to
	     pass over it. A pencil and a dotted underline are there at rest, and firm
	     up into a real field on hover and focus. -->
	<div class="group relative">
		<input
			bind:this={nameInput}
			bind:value={name}
			oninput={persist}
			name="name"
			placeholder={$LL.knowledgeNamePlaceholder()}
			spellcheck="false"
			class="-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 pr-8 text-lg font-semibold text-active decoration-shade-4 decoration-dotted underline-offset-[6px] outline-none transition-colors placeholder:font-normal placeholder:text-muted hover:border-shade-3 hover:no-underline focus:border-accent focus:bg-shade-0 focus:no-underline"
			class:underline={!!name}
		/>
		<Pencil
			class="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted opacity-60 transition-opacity group-focus-within:opacity-0"
		/>
	</div>

	<div class="flex items-center justify-between gap-3">
		<!-- Always there, including when no collection exists yet: the way to make
		     the first one is inside it, so hiding it until one exists would hide the
		     only door to it. -->
		<CollectionSelect bind:value={collectionId} class="max-w-48" />

		<!-- Two ways to write the same field. Plain text is the default because most
		     knowledge is prose; the code view is for the ones that are a schema or a
		     config, where line numbers and a monospace grid are the difference
		     between readable and not. -->
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
		<CodeEditor bind:value={content} onSubmit={persist} />
	{:else}
		<textarea
			bind:value={content}
			oninput={persist}
			placeholder={$LL.knowledgeContentPlaceholder()}
			class="min-h-0 w-full flex-1 resize-none rounded-lg border border-shade-3 bg-shade-0 p-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted focus:border-accent"
		></textarea>
	{/if}

	<p class="flex items-center justify-between gap-3 text-xs text-muted">
		<span>{isNew ? $LL.knowledgeModalHint() : formatTimestampToNow(updatedAt)}</span>
		{#if content.trim()}
			<span class="tabular-nums">{$LL.knowledgeTokens({ tokens: tokens.toLocaleString() })}</span>
		{/if}
	</p>
</EditorModal>
