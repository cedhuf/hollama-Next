<script lang="ts">
	import { ChevronRight, ImageIcon, MessagesSquare, Mic, Search, Settings2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { APP_NAME } from '$lib/brand';
	import Head from '$lib/components/Head.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { canDrawImages } from '$lib/images';
	import { sessionsStore, settingsStore } from '$lib/localStorage';
	import { resolveSessionTitle } from '$lib/sessions';
	import { searchModalOpen, settingsModalOpen } from '$lib/stores/modal';
	import { generateRandomId } from '$lib/utils';

	import Orb from './Orb.svelte';

	/**
	 * The first screen.
	 *
	 * Four bands, each answering a different question, in the order somebody
	 * actually asks them: who is this, hello, what can I start, and what was I
	 * doing. The hero is the only thing on the screen that carries the accent, and
	 * it carries it because it is the one thing this interface exists for.
	 *
	 * The greeting does not scroll away behind an image. This is an app people open
	 * forty times a day, and a screen that spends its top third saying hello wastes
	 * their time from the second visit onwards.
	 */
	const firstName = $derived($settingsStore.profileFirstName.trim());

	/** The last few. The whole list is one tab away, which is what that tab is for. */
	const recent = $derived(($sessionsStore ?? []).slice(0, 4));
</script>

<Head title={APP_NAME} />

<!-- The foot clears the floating bar: it is fixed, so anything under it would
     never be reachable. -->
<div class="flex flex-col gap-5 px-5 pt-4 pb-32">
	<!-- The two things a phone reaches for from a home screen that is not a list:
	     finding one conversation among many, and the account. Circular and in the
	     same glass as the bar at the foot, so the screen is bracketed by one
	     material. -->
	<header class="flex items-center gap-2.5">
		<Logo class="h-7 w-7" />
		<span class="text-active flex-1 text-base font-semibold tracking-tight">{APP_NAME}</span>

		<button
			type="button"
			onclick={() => ($searchModalOpen = true)}
			aria-label={$LL.search()}
			class="glass text-muted flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Search class="h-4 w-4" />
		</button>
		<button
			type="button"
			onclick={() => ($settingsModalOpen = true)}
			aria-label={$LL.settings()}
			class="glass text-muted flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Settings2 class="h-4 w-4" />
		</button>
	</header>

	<div class="flex flex-col gap-1">
		<h1 class="text-active text-3xl leading-tight font-semibold tracking-tight">
			{firstName ? $LL.mobileHelloName({ name: firstName }) : $LL.mobileHello()}
		</h1>
		<p class="text-muted text-sm">{$LL.mobileHelloBody()}</p>
	</div>

	<!-- The one card in the accent, because talking is what this interface is for.
	     The orb is the same body the voice screen fills the display with, small: a
	     card that shows what it opens rather than describing it. -->
	<button
		type="button"
		onclick={() => goto(resolve('/m/voice'))}
		class="hero relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 text-left transition-transform active:scale-[0.99]"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<span class="text-active text-xl leading-tight font-semibold tracking-tight">
				{$LL.mobileHeroTitle()}
			</span>
			<span class="text-muted text-xs leading-relaxed">{$LL.mobileHeroBody()}</span>
			<span
				class="bg-accent text-shade-0 mt-3 flex w-fit items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium"
			>
				<Mic class="h-3.5 w-3.5" />
				{$LL.mobileStartVoice()}
			</span>
		</div>

		<Orb class="h-24 w-24 shrink-0 text-[6rem]" />
	</button>

	<div class="grid grid-cols-2 gap-3">
		<button
			type="button"
			onclick={() => goto(resolve('/m/sessions/[id]', { id: generateRandomId() }))}
			class="border-shade-3 bg-shade-0 flex flex-col gap-6 rounded-2xl border p-4 text-left transition-transform active:scale-[0.99]"
		>
			<span class="bg-accent/10 flex h-9 w-9 items-center justify-center rounded-xl">
				<MessagesSquare class="text-accent h-4 w-4" />
			</span>
			<span class="flex items-center justify-between gap-2">
				<span class="text-active text-sm leading-tight font-medium">{$LL.mobileStartChat()}</span>
				<ChevronRight class="text-muted h-4 w-4 shrink-0" />
			</span>
		</button>

		{#if $canDrawImages}
			<button
				type="button"
				onclick={() => goto(resolve('/m/images'))}
				class="border-shade-3 bg-shade-0 flex flex-col gap-6 rounded-2xl border p-4 text-left transition-transform active:scale-[0.99]"
			>
				<span class="bg-accent/10 flex h-9 w-9 items-center justify-center rounded-xl">
					<ImageIcon class="text-accent h-4 w-4" />
				</span>
				<span class="flex items-center justify-between gap-2">
					<span class="text-active text-sm leading-tight font-medium">
						{$LL.mobileStartImage()}
					</span>
					<ChevronRight class="text-muted h-4 w-4 shrink-0" />
				</span>
			</button>
		{/if}
	</div>

	{#if recent.length}
		<section class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between gap-2">
				<h2 class="text-active text-lg font-semibold tracking-tight">{$LL.mobileRecent()}</h2>
				<a href={resolve('/m/sessions')} class="text-muted text-xs">{$LL.showMore()}</a>
			</div>

			<div class="flex flex-col gap-2">
				{#each recent as session (session.id)}
					<!-- One line, no border, no date. A home screen row has one job, which
					     is to be recognised and tapped; the second line and the frame around
					     it were weight for nothing. The list tab carries the detail. -->
					<a
						href={resolve('/m/sessions/[id]', { id: session.id })}
						class="bg-shade-0/70 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors active:opacity-70"
					>
						<MessagesSquare class="text-muted h-4 w-4 shrink-0" />
						<span class="text-active min-w-0 flex-1 truncate text-sm">
							{resolveSessionTitle(session)}
						</span>
						<ChevronRight class="text-muted h-4 w-4 shrink-0" />
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style lang="postcss">
	/* The same glass as the bar at the foot of the screen. Local to this file
	   rather than shared: two screens are not a pattern, and the day a third wants
	   it, it moves to `$lib` with a name. */
	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 55%, transparent);
		backdrop-filter: blur(24px) saturate(180%);
		-webkit-backdrop-filter: blur(24px) saturate(180%);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-shade-4) 45%, transparent);
	}

	:global([data-color-theme='dark']) .glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 62%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
			0 0 0 1px color-mix(in srgb, white 8%, transparent);
	}

	/* A wash rather than a border, and it leans: the one surface on the screen that
	   is not a bordered box, so the eye lands on it without anything shouting. */
	.hero {
		border: 1px solid color-mix(in srgb, var(--color-accent) 24%, transparent);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 20%, transparent),
			color-mix(in srgb, var(--color-accent) 6%, transparent) 55%,
			color-mix(in srgb, var(--color-accent) 14%, transparent)
		);
	}
</style>
