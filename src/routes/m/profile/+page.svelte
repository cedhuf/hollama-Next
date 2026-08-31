<script lang="ts">
	import { ChevronRight, Library, LogOut, Settings, Sparkles } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import Allowance from '$lib/components/Allowance.svelte';
	import Head from '$lib/components/Head.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { currentRole, currentUser } from '$lib/stores/auth';
	import { hasAccounts } from '$lib/stores/instance';
	import { settingsModalOpen } from '$lib/stores/modal';

	/**
	 * You, at a glance.
	 *
	 * Not a second Settings. The app's own settings dialog is one tap away from the
	 * tab bar and holds every field there is; a phone-shaped copy of it would be a
	 * second place to change the same thing, and the two would disagree the first
	 * time somebody edited one of them.
	 *
	 * What belongs here is what a phone actually wants to see: who you are signed
	 * in as, how much room this instance gives you, the look of the thing, and the
	 * two or three places worth reaching without going through a dialog.
	 */
	const displayName = $derived(
		[$settingsStore.profileFirstName, $settingsStore.profileLastName]
			.map((part) => part.trim())
			.filter(Boolean)
			.join(' ') || $LL.yourName()
	);

	const roleLabel = $derived($currentRole === 'admin' ? $LL.administrator() : $LL.user());
</script>

<Head title={$LL.mobileTabProfile()} />

<div class="flex flex-col gap-5 px-5 pt-6 pb-32">
	<div class="flex items-center gap-3">
		<PersonaAvatar
			persona={{
				name: displayName,
				avatarImage: $settingsStore.profileAvatar,
				avatarColor: $settingsStore.profileColor,
				avatarGlyph: ''
			}}
			size={52}
		/>
		<div class="flex min-w-0 flex-col">
			<span class="text-active truncate text-xl font-semibold tracking-tight">{displayName}</span>
			<span class="text-muted truncate text-xs">
				{$currentUser?.email || roleLabel}
			</span>
		</div>
	</div>

	<!-- What this instance gives you. The same card the welcome tour shows on its
	     own step, which is where somebody sees it once; this is where they come back
	     to check. -->
	<Allowance spend />

	<section class="flex flex-col gap-2">
		<h2 class="text-muted px-1 text-xs font-semibold tracking-wider uppercase">
			{$LL.appearance()}
		</h2>
		<div class="border-shade-3 bg-shade-0 rounded-2xl border p-3">
			<ThemePicker />
		</div>
	</section>

	<section class="flex flex-col gap-2">
		<a
			href={resolve('/m/library')}
			class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-opacity active:opacity-80"
		>
			<Library class="text-muted h-4 w-4 shrink-0" />
			<span class="text-active flex-1 text-sm">{$LL.library()}</span>
			<ChevronRight class="text-muted h-4 w-4 shrink-0" />
		</a>

		<button
			type="button"
			onclick={() => ($settingsModalOpen = true)}
			class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-opacity active:opacity-80"
		>
			<Settings class="text-muted h-4 w-4 shrink-0" />
			<span class="text-active flex-1 text-sm">{$LL.settings()}</span>
			<ChevronRight class="text-muted h-4 w-4 shrink-0" />
		</button>

		<!-- The other interface, one tap away and clearly labelled: somebody who
		     wants the sidebar back should not have to find a checkbox in a dialog to
		     get it. -->
		<button
			type="button"
			onclick={() => ($settingsStore.simplifiedMobileUI = false)}
			class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-opacity active:opacity-80"
		>
			<Sparkles class="text-muted h-4 w-4 shrink-0" />
			<span class="text-active flex-1 text-sm">{$LL.mobileLeave()}</span>
			<ChevronRight class="text-muted h-4 w-4 shrink-0" />
		</button>
	</section>

	{#if $hasAccounts}
		<form method="POST" action="/auth/signout">
			<input type="hidden" name="callbackUrl" value="/login" />
			<button
				type="submit"
				class="text-negative flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm transition-opacity active:opacity-70"
			>
				<LogOut class="h-4 w-4" />
				{$LL.mobileSignOut()}
			</button>
		</form>
	{/if}
</div>
