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

		<!-- A light behind it, and only here. On the voice screen the orb fills the
		     display and needs no help; on a card among other cards, at the app's usual
		     restraint, it read as something switched off rather than as the one thing
		     on the page meant to be pressed.

		     Behind rather than brighter, deliberately: turning the orb itself up would
		     have made it a different object on this page from the one it is on the
		     next, where the whole point is that they are the same body. -->
		<span class="relative flex shrink-0 items-center justify-center">
			<span class="halo" aria-hidden="true"></span>
			<Orb class="relative h-24 w-24 shrink-0" />
		</span>
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

	/*
	 * The light the orb sits in, on this card and nowhere else.
	 *
	 * Its own element behind the shape rather than a change to the shape, so the orb
	 * is the same object here as on the voice screen. The card already clips, so it
	 * is free to reach the edges and be cut by the rounding, which is what makes it
	 * read as light in the card rather than as a circle drawn on it.
	 *
	 * One colour throughout. It swells and dims, it never shifts hue: the orb's own
	 * colour is what says which state the app is in, and a halo that changed with it
	 * would be a second voice saying the same thing less clearly.
	 *
	 * Nearly nothing in the middle, brightest against the orb's own edge, and then a
	 * long way down to nothing. Two things follow from that shape.
	 *
	 * The orb is translucent, so anything bright behind its centre shines through and
	 * tints its inside, which reads as the orb having changed colour. Starting from
	 * almost transparent avoids that without leaving a hole.
	 *
	 * And there is no edge anywhere. An earlier version had a bright band between two
	 * stops twelve per cent apart, which is a ring drawn around the orb rather than
	 * light coming off it: the eye finds both boundaries and sees jewellery. A long
	 * ramp up and a longer one down has no boundary to find. That is also why the
	 * blur is almost nothing now, where it used to be doing the softening that the
	 * stops should have been doing all along.
	 */
	.halo {
		position: absolute;
		/* Close in. The light belongs against the shape, not around the card. */
		inset: -45%;
		border-radius: 9999px;
		pointer-events: none;
		background: radial-gradient(
			circle,
			transparent 0%,
			color-mix(in srgb, var(--color-accent) 7%, transparent) 30%,
			color-mix(in srgb, var(--color-accent) 46%, transparent) 46%,
			color-mix(in srgb, var(--color-accent) 27%, transparent) 58%,
			color-mix(in srgb, var(--color-accent) 12%, transparent) 72%,
			color-mix(in srgb, var(--color-accent) 4%, transparent) 86%,
			transparent 100%
		);
		filter: blur(6px);
		/*
		 * Two motions on two properties, at lengths that do not divide into each
		 * other, so the pair never lands twice in the same place. The same reason the
		 * orb is made of several slow drifts rather than one: a single period, however
		 * slow, is a rhythm the eye finds and then stops seeing.
		 */
		animation:
			halo-swell 6.7s ease-in-out infinite alternate,
			halo-fade 9.3s ease-in-out infinite alternate;
	}

	/* The peak sits on the orb's own edge, so swelling walks the brightest part
	   across the rim and back. That is what makes it read as light breathing off the
	   shape rather than as a circle changing size. */
	@keyframes halo-swell {
		from {
			scale: 0.94;
		}
		to {
			scale: 1.18;
		}
	}

	@keyframes halo-fade {
		from {
			opacity: 0.7;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.halo {
			animation: none;
		}
	}
</style>
