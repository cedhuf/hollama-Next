<script lang="ts">
	import { Bot, Check, LoaderCircle, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import NumberField from '$lib/components/NumberField.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		BOT_REPLIES_PER_HOUR_MAX,
		BOTS_PER_USER_MAX,
		DEFAULT_BOT_REPLIES_PER_HOUR,
		DEFAULT_BOTS_PER_USER,
		defaultConfig,
		INTEGRATION_KINDS,
		type IntegrationKind,
		type IntegrationView
	} from '$lib/integrations';
	import { integrationsConfig, loadIntegrationsConfig } from '$lib/integrationsConfig';
	import { toast } from '$lib/toast';

	import BotIntegration from './BotIntegration.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/**
	 * Bots that answer somewhere else.
	 *
	 * Built the way the connections tab is built, on purpose: a list of cards and
	 * a folded form to add one. Adding is two steps, which service and then what
	 * it needs, so the day there is a second service the picker grows a row and
	 * nothing else here changes.
	 */

	/** What each kind is called, and what it wants before it can be saved. */
	const KINDS: Record<IntegrationKind, { name: string; placeholder: string }> = {
		chatto: { name: 'Chatto', placeholder: 'https://chat.example.com' }
	};

	let integrations = $state<IntegrationView[]>([]);
	let loading = $state(true);

	/**
	 * Everybody's bots, for an administrator, and only as a roster.
	 *
	 * The counterpart of letting people run their own: two questions answered,
	 * what is running and on whose account, and two actions, switch it off and
	 * remove it. Not a second editor, because how a bot answers belongs to the
	 * person who configured it.
	 */
	let allBots = $state<(IntegrationView & { owner: string })[]>([]);

	/**
	 * The instance's ceilings, which an administrator sets here rather than in
	 * Admin: they are not a permission. They apply to every account including the
	 * one reading them, and what they protect is the machine and the bill.
	 */
	let botsPerUser = $state(DEFAULT_BOTS_PER_USER);
	let botRepliesPerHour = $state(DEFAULT_BOT_REPLIES_PER_HOUR);

	/** Keys typed but not yet stored, by integration id. Never filled from the server. */
	let secrets = $state<Record<string, string>>({});

	/** The one just added, opened so its options are where the eye already is. */
	let justAddedId = $state<string | null>(null);
	let adding = $state(false);
	let chosen = $state<IntegrationKind | null>(null);
	let creating = $state(false);
	let draft = $state({ label: '', baseUrl: '', secret: '' });

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			toast.error($LL.requestFailed(), { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		try {
			integrations = (await api<IntegrationView[]>('/api/integrations', 'GET')) ?? [];
		} finally {
			if ($integrationsConfig.isAdmin) {
				await loadLimits();
				await loadAllBots();
			}
			loading = false;
		}
	}

	async function loadLimits() {
		try {
			const response = await fetch('/api/admin/config');
			if (!response.ok) return;
			const config = await response.json();
			botsPerUser = config.botsPerUser ?? DEFAULT_BOTS_PER_USER;
			botRepliesPerHour = config.botRepliesPerHour ?? DEFAULT_BOT_REPLIES_PER_HOUR;
		} catch {
			// The defaults are already on screen and are what the server would apply.
		}
	}

	async function saveLimits() {
		await api('/api/admin/config', 'PUT', { botsPerUser, botRepliesPerHour });
		// The add form appears and disappears on this figure, and it is read from
		// the boot-time answer rather than from here.
		await loadIntegrationsConfig();
	}

	async function loadAllBots() {
		try {
			const response = await fetch('/api/admin/integrations');
			if (response.ok) allBots = await response.json();
		} catch {
			// A roster that will not load is not worth an error over the tab that
			// works: the administrator's own bots above are unaffected.
		}
	}

	/**
	 * Suspend a bot, or lift the suspension.
	 *
	 * The switch reads as "allowed", so it is on when nothing is blocking it.
	 * What it writes is the instance's decision, never the owner's: their own
	 * switch stays exactly where they left it.
	 */
	async function setBotAllowed(bot: IntegrationView, allowed: boolean) {
		await api(`/api/admin/integrations/${bot.id}`, 'PUT', { blocked: !allowed });
		await loadAllBots();
		// An administrator's own bot appears in both lists, and the card above
		// would otherwise keep showing a state it no longer reflects.
		integrations = integrations.map((own) =>
			own.id === bot.id ? { ...own, blocked: !allowed } : own
		);
	}

	async function removeBot(bot: IntegrationView) {
		await api(`/api/admin/integrations/${bot.id}`, 'DELETE');
		allBots = allBots.filter((entry) => entry.id !== bot.id);
		integrations = integrations.filter((own) => own.id !== bot.id);
	}

	onMount(load);

	function resetDraft() {
		adding = false;
		chosen = null;
		draft = { label: '', baseUrl: '', secret: '' };
	}

	async function create() {
		if (!chosen || !draft.baseUrl.trim() || !draft.secret.trim()) return;
		creating = true;
		try {
			// Checked before it is stored, so a wrong key is a message rather than a
			// card that sits there failing quietly in a log nobody is reading.
			const verdict = await api<{ ok: boolean; detail?: string; error?: string }>(
				'/api/integrations/verify',
				'POST',
				{
					kind: chosen,
					secret: draft.secret,
					config: { ...defaultConfig(chosen), baseUrl: draft.baseUrl }
				}
			);
			if (!verdict?.ok) {
				toast.error($LL.connectionFailed(), { description: verdict?.error });
				return;
			}

			const created = await api<IntegrationView>('/api/integrations', 'POST', {
				kind: chosen,
				label: draft.label.trim() || KINDS[chosen].name,
				// On, because somebody who has just proved a connection wants the bot,
				// not a second switch to find. It still does not run until a model is
				// chosen, and the card says so where the switch is.
				enabled: true,
				secret: draft.secret,
				config: { ...defaultConfig(chosen), baseUrl: draft.baseUrl }
			});
			if (created) {
				integrations = [...integrations, created];
				justAddedId = created.id;
			}
			resetDraft();
			toast.success($LL.connectedAsBot({ name: verdict.detail ?? '' }));
		} catch {
			// `api()` has already said what went wrong.
		} finally {
			creating = false;
		}
	}

	// Debounced save per integration, exactly as a connection saves.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function persist(integration: IntegrationView) {
		clearTimeout(timers[integration.id]);
		timers[integration.id] = setTimeout(() => {
			const secret = secrets[integration.id];
			void fetch(`/api/integrations/${integration.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					label: integration.label,
					enabled: integration.enabled,
					config: integration.config,
					// Omitted keeps the stored one. Sent only when somebody typed.
					...(secret ? { secret } : {})
				})
			}).then(() => {
				if (!secret) return;
				integration.hasSecret = true;
				secrets = { ...secrets, [integration.id]: '' };
			});
		}, 500);
	}

	async function verify(integration: IntegrationView) {
		const typed = secrets[integration.id];
		return (
			(await api<{ ok: boolean; detail?: string; error?: string }>(
				'/api/integrations/verify',
				'POST',
				{
					kind: integration.kind,
					id: integration.id,
					config: integration.config,
					...(typed ? { secret: typed } : {})
				}
			)) ?? { ok: false }
		);
	}

	async function remove(id: string) {
		await api(`/api/integrations/${id}`, 'DELETE');
		integrations = integrations.filter((entry) => entry.id !== id);
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.botIntegrations()} description={$LL.botIntegrationsDescription()}>
		{#if loading}
			<Skeleton />
		{:else if !integrations.length}
			<div class="border-shade-3 rounded-xl border">
				<EmptyMessage>{$LL.noIntegrations()}</EmptyMessage>
			</div>
		{:else}
			{#each integrations as integration, index (integration.id)}
				<BotIntegration
					bind:integration={integrations[index]}
					secret={secrets[integration.id] ?? ''}
					startOpen={integration.id === justAddedId}
					onChange={() => persist(integration)}
					onSecret={(value) => (secrets = { ...secrets, [integration.id]: value })}
					onDelete={() => remove(integration.id)}
					onVerify={() => verify(integration)}
				/>
			{/each}
		{/if}
	</SettingsSection>

	{#if !loading && integrations.length < $integrationsConfig.limit}
		<SettingsSection title={$LL.addAnIntegration()}>
			{#if !adding}
				<button
					type="button"
					onclick={() => (adding = true)}
					class="border-shade-4 text-muted hover:border-accent hover:text-active flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm transition-colors"
				>
					<Plus class="base-icon" />
					{$LL.addAnIntegration()}
				</button>
			{:else}
				<div class="border-shade-4 flex flex-col gap-3 rounded-xl border border-dashed p-4">
					{#if !chosen}
						<!-- One row today. It is a list because the second service is the
						     reason this whole layer exists, not because one needs choosing. -->
						<div class="flex flex-col gap-2">
							{#each INTEGRATION_KINDS as kind (kind)}
								<button
									type="button"
									onclick={() => (chosen = kind)}
									class="border-shade-3 hover:border-accent flex items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors"
								>
									<Bot class="base-icon text-muted" />
									{KINDS[kind].name}
								</button>
							{/each}
						</div>
						<button
							type="button"
							onclick={resetDraft}
							class="text-muted hover:text-active self-start text-xs transition-colors"
						>
							{$LL.cancel()}
						</button>
					{:else}
						<div class="flex items-center gap-2.5">
							<span
								class="bg-shade-2 text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
								aria-hidden="true"
							>
								<Bot class="base-icon" />
							</span>
							<input
								class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-0 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium outline-none"
								bind:value={draft.label}
								placeholder={KINDS[chosen].name}
								aria-label={$LL.label()}
							/>
							<button
								type="button"
								onclick={() => (chosen = null)}
								class="text-link shrink-0 text-xs hover:underline"
							>
								{$LL.change()}
							</button>
						</div>

						<!-- Only what it takes to prove the connection. Everything else is on
						     the card, which opens as soon as this succeeds. -->
						<SettingsField label={$LL.chattoServer()}>
							<input
								class="settings-field font-mono text-xs"
								bind:value={draft.baseUrl}
								placeholder={KINDS[chosen].placeholder}
							/>
						</SettingsField>
						<SettingsField label={$LL.botApiKey()} hint={$LL.botApiKeyHint()}>
							<input
								class="settings-field font-mono text-xs"
								type="password"
								autocomplete="off"
								bind:value={draft.secret}
								placeholder="cht_BK_…"
							/>
						</SettingsField>

						<div class="border-shade-3 flex items-center gap-2 border-t pt-3">
							<Button
								class="flex-1"
								onclick={create}
								disabled={creating || !draft.baseUrl.trim() || !draft.secret.trim()}
							>
								{#if creating}
									<LoaderCircle class="base-icon animate-spin" />
									{$LL.connecting()}
								{:else}
									<Check class="base-icon" />
									{$LL.connect()}
								{/if}
							</Button>
							<Button variant="outline" onclick={resetDraft}>{$LL.cancel()}</Button>
						</div>
					{/if}
				</div>
			{/if}
		</SettingsSection>
	{:else if !loading}
		<p class="text-muted text-xs">{$LL.botLimitReached()}</p>
	{/if}

	<!-- The rest of the tab is an administrator's, and it is two things: what
	     everybody may have, and what everybody is running. -->
	{#if !loading && $integrationsConfig.isAdmin}
		<SettingsSection title={$LL.botLimits()} description={$LL.botLimitsHint()} card>
			<div class="flex flex-wrap items-end gap-3">
				<div class="min-w-32 flex-1">
					<SettingsField label={$LL.botsPerUser()}>
						<NumberField
							value={botsPerUser}
							min={1}
							max={BOTS_PER_USER_MAX}
							onChange={(raw) => {
								botsPerUser = Number(raw) || DEFAULT_BOTS_PER_USER;
								saveLimits();
							}}
						/>
					</SettingsField>
				</div>
				<div class="min-w-32 flex-1">
					<SettingsField label={$LL.botRepliesPerHour()}>
						<NumberField
							value={botRepliesPerHour}
							min={1}
							max={BOT_REPLIES_PER_HOUR_MAX}
							onChange={(raw) => {
								botRepliesPerHour = Number(raw) || DEFAULT_BOT_REPLIES_PER_HOUR;
								saveLimits();
							}}
						/>
					</SettingsField>
				</div>
			</div>
		</SettingsSection>
	{/if}

	{#if !loading && $integrationsConfig.isAdmin && allBots.length}
		<SettingsSection title={$LL.allInstanceBots()} description={$LL.allInstanceBotsHint()}>
			{#each allBots as bot (bot.id)}
				<div class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-xl border px-3 py-2">
					<span class="min-w-0 flex-1">
						<span class="text-active block truncate text-sm">{bot.label || bot.kind}</span>
						<span class="text-muted block truncate text-xs">
							{bot.owner} · {bot.config.model || $LL.botNeedsAModel()}
							{#if !bot.enabled}· {$LL.offByItsOwner()}{/if}
						</span>
					</span>

					<label class="flex shrink-0 cursor-pointer items-center" title={$LL.botAllowed()}>
						<input
							type="checkbox"
							checked={!bot.blocked}
							onchange={(e) => setBotAllowed(bot, e.currentTarget.checked)}
							aria-label={$LL.botAllowed()}
							class="peer sr-only"
						/>
						<span
							class="bg-shade-3 peer-checked:bg-accent peer-focus-visible:ring-accent relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
						></span>
					</label>

					<ButtonConfirm compact label={$LL.deleteIntegration()} onConfirm={() => removeBot(bot)} />
				</div>
			{/each}
		</SettingsSection>
	{/if}
</SettingsPanel>
