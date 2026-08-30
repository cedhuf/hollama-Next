<script lang="ts">
	import { Bot, Check, LoaderCircle, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		defaultConfig,
		INTEGRATION_KINDS,
		type IntegrationKind,
		type IntegrationView
	} from '$lib/integrations';
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
			loading = false;
		}
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

	{#if !loading}
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
	{/if}
</SettingsPanel>
