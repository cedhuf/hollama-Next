<script lang="ts">
	import {
		ChevronDown,
		Info,
		Plus,
		RotateCcw,
		Trash2,
		TriangleAlert,
		Wallet,
		X
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { quadInOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import Collapsible from '$lib/components/Collapsible.svelte';
	import Select from '$lib/components/Select.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/**
	 * The accounts on this instance.
	 *
	 * Its own tab rather than a section at the bottom of Admin. Admin is about how
	 * the instance behaves (what is shared, what is locked, what users may change
	 *) and every control there is a policy. This is a list of people, with two
	 * actions that are neither of those: adding somebody, and removing them along
	 * with everything they wrote. It was the one thing on that page you scrolled
	 * to rather than read.
	 *
	 * Loads on mount rather than with the rest of the admin configuration: nothing
	 * here needs it, and a tab nobody opened is a request nobody made.
	 */
	/**
	 * The row as the endpoint sends it, declared here rather than imported from
	 * the database module: a type import is erased, but pointing a browser
	 * component at `server/db` is an invitation for the next edit to reach for
	 * something that is not.
	 */
	interface UserRow {
		id: string;
		email: string;
		role: string;
		created_at: string;
		last_seen_at: string | null;
		/** Null means the instance's allowance, which is what most accounts have. */
		credit_limit: number | null;
		credit_period: 'month' | 'week' | 'day' | null;
		effectiveLimit: number;
		effectivePeriod: 'month' | 'week' | 'day';
		spend: { inputTokens: number; outputTokens: number; cost: number };
	}

	let users = $state<UserRow[]>([]);
	let period = $state<'month' | 'week'>('month');
	let instanceLimit = $state(0);
	/** Empty is how "no limit" is written, so nothing shows a bare 0 as a value. */
	let instanceLimitField = $state('');
	/** Shared models nobody has priced, which a limit in force turns into a hole. */
	let unpriced = $state<{ serverId: string; label: string; models: string[] }[]>([]);
	/** Which account has its allowance open. Folded by default, like a model's price. */
	const opened = new SvelteSet<string>();
	/** Until the first load settles, the empty state below would be a lie. */
	let loading = $state(true);
	let showCreate = $state(false);
	let draft = $state({ email: '', password: '', role: 'user' });

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			const detail = await response.text();
			toast.error($LL.requestFailed(), { description: detail || response.statusText });
			throw new Error(detail || response.statusText);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		try {
			const data = await fetch('/api/admin/users').then((r) => r.json());
			users = data.users;
			period = data.period;
			instanceLimit = data.instanceLimit;
			instanceLimitField = instanceLimit > 0 ? String(instanceLimit) : '';
			unpriced = data.unpriced ?? [];
		} finally {
			loading = false;
		}
	}

	/**
	 * Set or clear one account's own allowance.
	 *
	 * An empty field means "follow the instance", not "no limit": those are
	 * different answers, and only one of them keeps following when the instance's
	 * figure changes.
	 */
	async function setLimit(user: UserRow, raw: string) {
		// A comma is the decimal separator most of Europe types, and a `number` field
		// reports an empty value for it: typing "0,5" did not set a limit of a half,
		// it silently put the account back on the instance's. Text field, both
		// separators read, like every other price in the app.
		const text = raw.trim().replace(',', '.');
		const value = text === '' ? null : Number(text);
		if (value !== null && (!Number.isFinite(value) || value < 0)) return;
		await api(`/api/admin/users/${user.id}`, 'PUT', { creditLimit: value });
		await load();
	}

	/**
	 * The instance's allowance, and how often it starts again.
	 *
	 * Here rather than in Admin, above the accounts it applies to. Admin is
	 * governance in the abstract; a default allowance is a fact about this list,
	 * and reading it a screen away from the column it fills in is how a number
	 * ends up set twice.
	 */
	async function saveInstance() {
		const text = instanceLimitField.trim().replace(',', '.');
		const value = text === '' ? 0 : Number(text);
		if (!Number.isFinite(value) || value < 0) return;
		instanceLimit = value;
		await api('/api/admin/config', 'PUT', { creditLimit: value, creditPeriod: period });
		await load();
	}

	/** No ceiling, written as the one character that says exactly that. */
	const UNLIMITED = '\u221e';

	/** One account's own period, or back to the instance's when cleared. */
	async function setPeriod(user: UserRow, value: string) {
		await api(`/api/admin/users/${user.id}`, 'PUT', { creditPeriod: value || null });
		await load();
	}

	/** Both fields back to following the instance, in one gesture. */
	async function resetUser(user: UserRow) {
		await api(`/api/admin/users/${user.id}`, 'PUT', { creditLimit: null, creditPeriod: null });
		await load();
	}

	const periodLabel = (value: 'month' | 'week' | 'day') =>
		value === 'week'
			? $LL.creditPeriodWeek()
			: value === 'day'
				? $LL.creditPeriodDay()
				: $LL.creditPeriodMonth();

	const money = (value: number) =>
		value.toLocaleString(undefined, { maximumFractionDigits: value < 1 ? 3 : 2 });

	onMount(load);

	/** Hours until a day has passed, then days. Nobody needs a minute count here. */
	function lastSeen(at: string): string {
		const hours = Math.floor((Date.now() - new Date(at).getTime()) / 3_600_000);
		if (hours < 1) return $LL.lastSeenNow();
		if (hours < 24) return $LL.lastSeenHours({ hours });
		return $LL.lastSeenDays({ days: Math.floor(hours / 24) });
	}

	async function addUser() {
		if (!draft.email || !draft.password) return toast.error($LL.emailAndPasswordRequired());
		await api('/api/admin/users', 'POST', draft);
		draft = { email: '', password: '', role: 'user' };
		showCreate = false;
		await load();
		toast.success($LL.userCreated());
	}

	async function removeUser(id: string) {
		if (!confirm($LL.deleteUserConfirm())) return;
		await api(`/api/admin/users/${id}`, 'DELETE');
		await load();
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.users()} description={$LL.usersDescription()}>
		<!-- Under the heading and above the rows it governs: an allowance is read as
			     a property of this list, and a screen away from the column it fills in is
			     how a number ends up set twice. Folded, because most instances never set
			     one, and what it is set to is on the closed row. -->
		<Collapsible
			title={$LL.credits()}
			summary={instanceLimit > 0 ? money(instanceLimit) : UNLIMITED}
			icon={Wallet}
		>
			<!-- What the figures are worth, before the fields that set them. Short on
			     purpose: what somebody needs to know here is that this counts well
			     enough to catch a runaway, not well enough to bill anyone. -->
			<p
				class="border-shade-3 bg-shade-1 text-muted flex items-start gap-1.5 rounded-md border p-2 text-xs"
			>
				<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
				{$LL.creditsApproximate()}
			</p>
			<!-- The same two controls the per-account panel shows, in the same boxes:
			     one is the default for everybody, the other is one person's override,
			     and two layouts for one decision is how they stop matching. -->
			<div class="flex flex-wrap items-end gap-2">
				<label class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
					<span class="text-muted">{$LL.creditLimitDefault()}</span>
					<!-- Empty rather than a zero sitting in the field: "nobody has set one"
					     and "somebody typed nought" read the same on screen, and only one of
					     them is what an untouched instance has. -->
					<input
						class="settings-field text-right tabular-nums"
						type="text"
						inputmode="decimal"
						bind:value={instanceLimitField}
						onchange={saveInstance}
						placeholder={UNLIMITED}
						aria-label={$LL.creditLimitDefault()}
					/>
				</label>

				<!-- Not a <label>: it forwards its click to the control it labels, which
				     on a menu trigger is a second click: the menu opens and shuts in the
				     same gesture. Sized for the longest option, so choosing a short one
				     does not move everything beside it. -->
				<div class="flex flex-col gap-1 text-sm">
					<span class="text-muted">{$LL.creditPeriod()}</span>
					<div class="w-52">
						<Select
							bind:value={period}
							options={[
								{ value: 'month', label: $LL.creditPeriodMonth() },
								{ value: 'week', label: $LL.creditPeriodWeek() },
								{ value: 'day', label: $LL.creditPeriodDay() }
							]}
							onChange={saveInstance}
						/>
					</div>
				</div>
			</div>

			<p class="text-muted text-xs">{$LL.creditsHelp()}</p>

			{#if unpriced.length}
				<!-- Not a nicety. While a limit is in force these models are refused, and
				     the reason is here rather than in a log the person who set the limit
				     will never read. -->
				<div class="border-warning/40 bg-warning/10 flex flex-col gap-1 rounded-lg border p-3">
					<span class="text-active flex items-center gap-1.5 text-sm font-medium">
						<TriangleAlert class="h-4 w-4 shrink-0" />
						{$LL.unpricedModels()}
					</span>
					<p class="text-muted text-xs leading-relaxed">{$LL.unpricedModelsHelp()}</p>
					{#each unpriced as entry (entry.serverId)}
						<p class="text-muted text-xs">
							<span class="text-active">{entry.label}</span>
							<span class="font-mono">{entry.models.join(', ')}</span>
						</p>
					{/each}
				</div>
			{/if}
		</Collapsible>

		{#if loading}
			<Skeleton variant="row" count={3} />
		{/if}

		{#each users as user (user.id)}
			<div class="border-shade-3 flex flex-col gap-1.5 rounded-md border p-2 text-sm">
				<div class="flex items-center justify-between gap-2">
					<span class="min-w-0 truncate">
						{user.email}
						<span class="text-muted text-xs">({user.role})</span>
					</span>
					<!-- Quiet and to the right of the row, before the one control that acts on
				     it: an administrator scanning the list is looking for who is still
				     around, not reading a report. Blank rather than a guess for an account
				     nobody has opened since this existed. -->
					<span class="text-muted ml-auto shrink-0 text-[11px] tabular-nums">
						{user.last_seen_at ? lastSeen(user.last_seen_at) : $LL.lastSeenNever()}
					</span>
					<Button variant="icon" onclick={() => removeUser(user.id)}>
						<Trash2 class="base-icon" />
					</Button>
				</div>

				<!-- What they have spent this period, and what they may. An empty field
				     follows the instance; a figure overrides it; zero is no limit. -->
				<!-- What this account has spent, and what it is allowed. The allowance
				     itself is folded away: most accounts follow the instance, and a row of
				     controls on every one of them is a list nobody can read down. -->
				<div class="text-muted flex items-center gap-2 text-xs">
					<span class="tabular-nums">
						{$LL.usageSpent({ spent: money(user.spend.cost) })}
					</span>
					<!-- The ceiling as a figure, or the sign for not having one. Zero is
					     what "no limit" is stored as, and printing a bare 0 next to a spend
					     reads as an allowance of nothing, which is the opposite. -->
					<span class="opacity-60">
						{user.effectiveLimit > 0 ? money(user.effectiveLimit) : UNLIMITED}
						· {periodLabel(user.effectivePeriod)}
					</span>

					<button
						type="button"
						onclick={() => (opened.has(user.id) ? opened.delete(user.id) : opened.add(user.id))}
						aria-expanded={opened.has(user.id)}
						class="hover:bg-shade-2 ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors {user.credit_limit ==
							null && user.credit_period == null
							? 'text-muted'
							: 'text-active'}"
					>
						<Wallet class="h-3 w-3" />
						{user.credit_limit == null && user.credit_period == null
							? $LL.creditLimitInherited()
							: $LL.creditLimitOwn()}
						<ChevronDown
							class="h-3 w-3 transition-transform {opened.has(user.id) ? 'rotate-180' : ''}"
						/>
					</button>
				</div>

				{#if opened.has(user.id)}
					<!-- The same two controls as the instance's, because it is the same
					     decision made for one person. Empty and "follow the instance" are
					     what an account has until somebody decides otherwise, and the note
					     says which one is winning. -->
					<div
						class="border-shade-3 bg-shade-1 flex flex-col gap-2 rounded-md border p-2"
						transition:slide={{ duration: 160, easing: quadInOut }}
					>
						<!-- Labels beside their control rather than above it: this panel opens
						     inside a row of a list, and two stacked captions push every account
						     under it down a line for nothing. -->
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<label class="flex min-w-0 flex-1 items-center gap-2 text-xs">
								<span class="text-muted shrink-0">{$LL.creditLimit()}</span>
								<input
									class="settings-field min-w-0 flex-1 text-right tabular-nums"
									type="text"
									inputmode="decimal"
									value={user.credit_limit ?? ''}
									placeholder={instanceLimit > 0 ? money(instanceLimit) : UNLIMITED}
									aria-label="{user.email} · {$LL.creditLimit()}"
									onchange={(e) => setLimit(user, e.currentTarget.value)}
								/>
							</label>

							<!-- Not a <label>: it forwards its click to the control it labels,
							     which on a menu trigger is a second click, so the menu opens and
							     shuts in the same gesture. -->
							<div class="flex shrink-0 items-center gap-2 text-xs">
								<span class="text-muted shrink-0">{$LL.creditPeriod()}</span>
								<div class="w-52">
									<Select
										value={user.credit_period ?? ''}
										options={[
											{ value: '', label: $LL.creditPeriodInherit() },
											{ value: 'month', label: $LL.creditPeriodMonth() },
											{ value: 'week', label: $LL.creditPeriodWeek() },
											{ value: 'day', label: $LL.creditPeriodDay() }
										]}
										onChange={(option) => setPeriod(user, option.value)}
									/>
								</div>
							</div>
						</div>

						<p class="text-muted text-[11px]">{$LL.creditOverrideHelp()}</p>

						{#if user.credit_limit != null || user.credit_period != null}
							<button
								type="button"
								onclick={() => resetUser(user)}
								class="border-shade-3 text-muted hover:border-shade-4 hover:text-active flex items-center gap-1.5 self-start rounded-md border px-2 py-1 text-[11px] transition-colors"
							>
								<RotateCcw class="h-3 w-3" />
								{$LL.creditLimitInherit()}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if showCreate}
			<div class="border-shade-3 flex flex-col gap-2 rounded-md border p-3">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">{$LL.createAUser()}</span>
					<button
						type="button"
						onclick={() => (showCreate = false)}
						class="text-muted hover:text-active transition-colors"
						aria-label={$LL.close()}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<input class="settings-field" type="email" bind:value={draft.email} placeholder="Email" />
				<input
					class="settings-field"
					type="password"
					bind:value={draft.password}
					placeholder={$LL.initialPassword()}
				/>
				<Select
					bind:value={draft.role}
					options={[
						{ value: 'user', label: 'user' },
						{ value: 'admin', label: 'admin' }
					]}
				/>
				<Button onclick={addUser}><Plus class="base-icon" /> {$LL.createUser()}</Button>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showCreate = true)}
				class="border-shade-4 text-muted hover:border-accent hover:text-active flex items-center gap-2 self-start rounded-md border border-dashed px-3 py-1.5 text-sm transition-colors"
			>
				<Plus class="h-4 w-4" />
				{$LL.addUser()}
			</button>
		{/if}
	</SettingsSection>
</SettingsPanel>
