<script lang="ts">
	import { Plus, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/**
	 * The accounts on this instance.
	 *
	 * Its own tab rather than a section at the bottom of Admin. Admin is about how
	 * the instance behaves — what is shared, what is locked, what users may change
	 * — and every control there is a policy. This is a list of people, with two
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
	}

	let users = $state<UserRow[]>([]);
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
			users = await fetch('/api/admin/users').then((r) => r.json());
		} finally {
			loading = false;
		}
	}

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
		{#if loading}
			<Skeleton variant="row" count={3} />
		{/if}

		{#each users as user (user.id)}
			<div
				class="flex items-center justify-between gap-2 rounded-md border border-shade-3 p-2 text-sm"
			>
				<span class="min-w-0 truncate">
					{user.email}
					<span class="text-xs text-muted">({user.role})</span>
				</span>
				<!-- Quiet and to the right of the row, before the one control that acts on
				     it: an administrator scanning the list is looking for who is still
				     around, not reading a report. Blank rather than a guess for an account
				     nobody has opened since this existed. -->
				<span class="ml-auto shrink-0 text-[11px] tabular-nums text-muted">
					{user.last_seen_at ? lastSeen(user.last_seen_at) : $LL.lastSeenNever()}
				</span>
				<Button variant="icon" onclick={() => removeUser(user.id)}>
					<Trash2 class="base-icon" />
				</Button>
			</div>
		{/each}

		{#if showCreate}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">{$LL.createAUser()}</span>
					<button
						type="button"
						onclick={() => (showCreate = false)}
						class="text-muted transition-colors hover:text-active"
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
				class="flex items-center gap-2 self-start rounded-md border border-dashed border-shade-4 px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-active"
			>
				<Plus class="h-4 w-4" />
				{$LL.addUser()}
			</button>
		{/if}
	</SettingsSection>
</SettingsPanel>
