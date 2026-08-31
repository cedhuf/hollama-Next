<script lang="ts">
	import { Bot, Check, KeyRound, LoaderCircle, Plug, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { toolLabels } from '$lib/chatTools';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
	import NumberField from '$lib/components/NumberField.svelte';
	import Select from '$lib/components/Select.svelte';
	import {
		BOT_TOOLS,
		CONTEXT_COUNT_MAX,
		CONTEXT_COUNT_MIN,
		isRunnable,
		POLL_SECONDS_MAX,
		POLL_SECONDS_MIN,
		type IntegrationView
	} from '$lib/integrations';
	import { personasStore, settingsStore } from '$lib/localStorage';

	import SettingsCard from './SettingsCard.svelte';
	import SettingsField from './SettingsField.svelte';

	/**
	 * One configured bot: a line, and its options underneath when asked for.
	 *
	 * Folded the way a connection is folded, and for the same reason: what a
	 * reader wants from a list of them is which one this is and whether it runs.
	 * Ten fields unrolled for each is a list nobody can scan.
	 *
	 * Everything is saved as it is typed, debounced by the parent. The key is the
	 * exception, because it is never read back: an untouched field means "keep
	 * what is stored", and only a typed value replaces it.
	 */
	interface Props {
		integration: IntegrationView;
		/** Typed but not yet stored. Sent once, then cleared by the parent. */
		secret: string;
		/** Open on arrival, for the one that was just added. */
		startOpen?: boolean;
		onChange: () => void;
		onSecret: (value: string) => void;
		onDelete: () => void;
		onVerify: () => Promise<{ ok: boolean; detail?: string; error?: string }>;
	}

	let {
		integration = $bindable(),
		secret,
		startOpen = false,
		onChange,
		onSecret,
		onDelete,
		onVerify
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	let showAdvanced = $state(false);
	let replacingKey = $state(false);
	let verifying = $state(false);
	let verdict = $state<{ ok: boolean; detail?: string; error?: string } | null>(null);

	/** A stored key is never returned, so an empty password field would read as "none". */
	const keyIsStored = $derived(integration.hasSecret && !secret && !replacingKey);

	/** Wanted, allowed and complete are three different things. All three, or nothing runs. */
	const runs = $derived(integration.enabled && !integration.blocked && isRunnable(integration));

	/** Named from the same list the composer's menu uses, so a tool reads the same everywhere. */
	const toolOptions = $derived(
		BOT_TOOLS.map((tool) => ({
			value: tool,
			label: toolLabels($LL)[tool],
			// MCP is the one entry here whose consequence is not like the others':
			// everywhere else in the app a call is put to a person first, and a bot
			// has nobody to ask. Marked in the list itself, because that is where the
			// choice is made.
			danger: tool === 'mcp',
			hint: tool === 'mcp' ? $LL.botMcpWarning() : undefined
		}))
	);

	const personaOptions = $derived(
		$personasStore.map((persona) => ({ value: persona.id, label: persona.name }))
	);

	/** What the closed line says, so opening it is a choice rather than a hunt. */
	const summary = $derived(
		[integration.config.model || $LL.botNeedsAModel(), integration.config.baseUrl]
			.filter(Boolean)
			.join(' · ')
	);

	/**
	 * A model is chosen by name, and a name alone does not say where it is served.
	 *
	 * The same lookup the composer does: the catalogue knows which connection each
	 * model came from, and the run needs the connection, not the name.
	 */
	function pickModel(name: string) {
		const known = $settingsStore.models.find((entry) => entry.name === name);
		integration.config.model = name;
		integration.config.serverId = known?.serverId ?? integration.config.serverId;
		onChange();
	}

	/**
	 * Forget the last answer when the question changes.
	 *
	 * A green button beside an address or a key that has since been edited is a
	 * button claiming something was verified that never was.
	 */
	function invalidate() {
		verdict = null;
	}

	async function verify() {
		verifying = true;
		verdict = null;
		try {
			verdict = await onVerify();
		} finally {
			verifying = false;
		}
	}
</script>

<SettingsCard
	bind:open
	label={$LL.botOptions()}
	bind:enabled={integration.enabled}
	enabledLabel={$LL.integrationEnabled()}
	onToggle={onChange}
	healthy={runs}
	iconClass="bg-shade-2 {runs ? 'text-positive' : 'text-muted'}"
>
	{#snippet icon()}
		<Bot class="base-icon" />
	{/snippet}

	{#snippet title()}
		<!-- The name is the heading and the field at once, as it is when a connection
		     is added: renaming something is editing what is already on screen, and a
		     second box further down asking the same question is a second question.

		     `field-sizing: content` is the whole trick: the field measures its own
		     text and is exactly that wide. `size` stays as the fallback for a browser
		     that does not know the property yet, and it counts in the width of a zero,
		     which is wider than an average letter: that slack on the right is what the
		     property removes. -->
		<input
			class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-1 pointer-events-auto relative -mx-2 field-sizing-content max-w-full rounded-md border border-transparent px-2 py-0.5 text-sm font-medium outline-none"
			size={(integration.label || 'Chatto').length + 1}
			bind:value={integration.label}
			oninput={onChange}
			placeholder="Chatto"
			aria-label={$LL.label()}
		/>
	{/snippet}

	{#snippet subtitle()}
		<span class="truncate">{summary}</span>
	{/snippet}

	<!-- The key and the button that proves it, on one line: "is this right?"
			     is a question about the field it sits next to. -->
	<!-- No hint here, unlike the form that adds one: where to find the key is
			     something you need once, and a bot that already answers has answered it. -->
	<SettingsField label={$LL.botApiKey()}>
		<div class="flex items-center gap-2">
			{#if keyIsStored}
				<div
					class="border-shade-3 bg-shade-1 flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5"
				>
					<KeyRound class="text-positive h-3.5 w-3.5 shrink-0" />
					<span class="text-muted flex-1 text-sm">{$LL.apiKeySaved()}</span>
					<button type="button" onclick={() => (replacingKey = true)} class="text-link text-xs">
						{$LL.apiKeyReplace()}
					</button>
				</div>
			{:else}
				<input
					class="settings-field flex-1"
					type="password"
					autocomplete="off"
					value={secret}
					oninput={(e) => {
						invalidate();
						onSecret(e.currentTarget.value);
					}}
					placeholder="cht_BK_…"
				/>
				{#if integration.hasSecret}
					<button
						type="button"
						onclick={() => {
							onSecret('');
							replacingKey = false;
						}}
						aria-label={$LL.apiKeyKeep()}
						title={$LL.apiKeyKeep()}
						class="text-muted hover:text-active shrink-0 rounded-md p-1.5 transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			{/if}
			<!-- The answer lands in the button that asked the question: a result
					     placed away from its cause is one somebody has to go looking for.
					     The hover colours are forced, because the outline variant paints its
					     own on top otherwise and a green button turned black under the
					     pointer reads as an answer that expired. -->
			<Button
				variant="outline"
				onclick={verify}
				disabled={verifying || !integration.config.baseUrl}
				title={verdict?.ok
					? $LL.connectedAsBot({ name: verdict.detail ?? '' })
					: (verdict?.error ?? $LL.checkConnection())}
				class={verdict?.ok
					? 'border-positive! text-positive! hover:border-positive! hover:text-positive!'
					: verdict
						? 'border-negative! text-negative! hover:border-negative! hover:text-negative!'
						: ''}
			>
				{#if verifying}
					<LoaderCircle class="base-icon animate-spin" />
				{:else if verdict?.ok}
					<Check class="base-icon" />
				{:else}
					<Plug class="base-icon" />
				{/if}
				<!-- The three wordings stacked in one cell, all laid out and only one
						     shown: the button is then as wide as the longest of them in
						     whatever language it is read in, and changing state cannot move
						     the field beside it. -->
				<span class="grid text-center">
					<span class="col-start-1 row-start-1 {verdict?.ok ? '' : 'invisible'}">
						{$LL.connected()}
					</span>
					<span class="col-start-1 row-start-1 {verdict && !verdict.ok ? '' : 'invisible'}">
						{$LL.connectionFailed()}
					</span>
					<span class="col-start-1 row-start-1 {verdict ? 'invisible' : ''}">
						{$LL.checkConnection()}
					</span>
				</span>
			</Button>
		</div>
		<!-- Failures keep their own line: a server says why in a sentence, and a
				     sentence does not fit in a button. -->
		{#if verdict && !verdict.ok}
			<span class="text-negative text-xs">{verdict.error}</span>
		{/if}
	</SettingsField>

	<SettingsField label={$LL.model()}>
		<ModelSelect value={integration.config.model} onSelect={pickModel} />
	</SettingsField>

	<!-- Who the bot is. Three sources, and only one at a time: the account's
			     usual instructions, a persona's prompt, or what is written here. -->
	<SettingsField
		label={$LL.whoTheBotIs()}
		hint={integration.config.instructionsMode === 'persona'
			? $LL.usePersonaPromptHint()
			: integration.config.instructionsMode === 'default'
				? $LL.instructionsDefaultHint()
				: undefined}
	>
		<Select
			value={integration.config.instructionsMode}
			options={[
				{ value: 'default', label: $LL.instructionsDefault() },
				{ value: 'persona', label: $LL.instructionsPersona() },
				{ value: 'custom', label: $LL.instructionsCustom() }
			]}
			onChange={(option) => {
				integration.config.instructionsMode =
					option.value as typeof integration.config.instructionsMode;
				onChange();
			}}
		/>
	</SettingsField>

	{#if integration.config.instructionsMode === 'persona'}
		<SettingsField label={$LL.personas()}>
			<Select
				value={integration.config.personaId ?? ''}
				options={personaOptions}
				searchable
				onChange={(option) => {
					integration.config.personaId = option.value || undefined;
					onChange();
				}}
			/>
		</SettingsField>
	{:else if integration.config.instructionsMode === 'custom'}
		<SettingsField label={$LL.systemPrompt()}>
			<textarea
				class="settings-field min-h-24 resize-y text-xs"
				bind:value={integration.config.instructions}
				oninput={onChange}></textarea>
		</SettingsField>
	{/if}

	<!-- How much, and how many, on one line: the number is not a second
			     question, it is the rest of the answer to this one. It appears only for
			     the mode that has a number to give. -->
	<SettingsField label={$LL.contextSent()} hint={$LL.contextSentHint()}>
		<div class="flex items-center gap-2">
			<Select
				class="min-w-0 flex-1"
				value={integration.config.context}
				options={[
					{ value: 'mention', label: $LL.contextMention() },
					{ value: 'recent', label: $LL.contextRecent() },
					{ value: 'thread', label: $LL.contextThread() }
				]}
				onChange={(option) => {
					integration.config.context = option.value as typeof integration.config.context;
					onChange();
				}}
			/>
			{#if integration.config.context === 'recent'}
				<!-- The field draws itself full-width, so the width is set here, on a
						     wrapper that refuses to grow: two digits and two steppers need a
						     fixed corner, not half the row. -->
				<div class="w-24 shrink-0">
					<NumberField
						class="text-right"
						label={$LL.howManyMessagesBefore()}
						value={integration.config.contextCount}
						min={CONTEXT_COUNT_MIN}
						max={CONTEXT_COUNT_MAX}
						onChange={(raw) => {
							integration.config.contextCount = Number(raw) || CONTEXT_COUNT_MIN;
							onChange();
						}}
					/>
				</div>
			{/if}
		</div>
	</SettingsField>

	<SettingsField label={$LL.whereToAnswer()}>
		<Select
			value={integration.config.placement}
			options={[
				{ value: 'auto', label: $LL.placementAuto() },
				{ value: 'thread', label: $LL.placementThread() },
				{ value: 'room', label: $LL.placementRoom() }
			]}
			onChange={(option) => {
				integration.config.placement = option.value as typeof integration.config.placement;
				onChange();
			}}
		/>
	</SettingsField>

	<SettingsField label={$LL.tools()}>
		<MultiSelect
			value={integration.config.tools}
			options={toolOptions}
			placeholder={$LL.none()}
			onChange={(value) => {
				integration.config.tools = value as typeof integration.config.tools;
				onChange();
			}}
		/>
	</SettingsField>

	<!-- Said where it is decided, not in the documentation. MCP behaves
			     differently here than anywhere else in the app, and somebody ticking
			     it in a list of five ordinary tools has no way to know that. -->
	{#if integration.config.tools.includes('mcp')}
		<p class="text-muted text-xs leading-snug">{$LL.botMcpWarning()}</p>
	{/if}

	<!-- Enabled and running are not the same thing, and the difference is
			     invisible otherwise. Two reasons a switched-on bot stays quiet, and
			     the suspension comes first because it is the one the owner cannot fix
			     and would otherwise spend the afternoon trying to. -->
	{#if integration.blocked}
		<span class="text-negative border-shade-3 border-t pt-3 text-xs">
			{$LL.botBlockedByAdmin()}
		</span>
	{:else if integration.enabled && !isRunnable(integration)}
		<span class="text-negative border-shade-3 border-t pt-3 text-xs">
			{$LL.botNeedsAModel()}
		</span>
	{/if}

	<!-- The address is answered once, when the bot is added, and is then a
			     thing you change after moving a server. It belongs here rather than at
			     the top of a form somebody opens to change a model. -->
	{#if showAdvanced}
		<div class="border-shade-3 flex flex-col gap-3 border-t pt-3">
			<SettingsField label={$LL.chattoServer()} hint={$LL.chattoServerHint()}>
				<input
					class="settings-field font-mono text-xs"
					bind:value={integration.config.baseUrl}
					oninput={() => {
						invalidate();
						onChange();
					}}
					placeholder="https://chat.example.com"
				/>
			</SettingsField>

			<SettingsField label={$LL.checkEverySeconds()}>
				<NumberField
					value={integration.config.pollSeconds}
					min={POLL_SECONDS_MIN}
					max={POLL_SECONDS_MAX}
					onChange={(raw) => {
						integration.config.pollSeconds = Number(raw) || POLL_SECONDS_MIN;
						onChange();
					}}
				/>
			</SettingsField>
		</div>
	{/if}

	<!-- Footer: the occasional actions, kept out of the way of the fields.
			     Delete confirms in place rather than through a dialog. -->
	<div class="border-shade-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
		<button
			type="button"
			onclick={() => (showAdvanced = !showAdvanced)}
			class="text-muted hover:text-active text-xs transition-colors"
		>
			{$LL.advancedSettings()}
		</button>

		<div class="ml-auto flex items-center gap-2">
			<ButtonConfirm onConfirm={onDelete} label={$LL.deleteIntegration()} />
		</div>
	</div>
</SettingsCard>
