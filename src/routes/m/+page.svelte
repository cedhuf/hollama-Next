<script lang="ts">
	import { ChevronRight, ImageIcon, MessagesSquare, Mic, Search, Settings2 } from '@lucide/svelte';

	import LL, { locale } from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { APP_NAME } from '$lib/brand';
	import Head from '$lib/components/Head.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { heroLine } from '$lib/heroLines';
	import { canDrawImages } from '$lib/images';
	import { personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { launchPersona, type Persona } from '$lib/personas';
	import { resolveSessionTitle } from '$lib/sessions';
	import { searchModalOpen, settingsModalOpen } from '$lib/stores/modal';
	import { generateRandomId } from '$lib/utils';
	import Bloom from '$lib/voice/Bloom.svelte';

	/**
	 * The first screen: four bands, in the order somebody actually asks them. Who
	 * is this, hello, what can I start, what was I doing.
	 *
	 * The greeting does not scroll away behind an image: this is an app people open
	 * forty times a day, and a screen spending its top third saying hello wastes
	 * their time from the second visit onwards.
	 */
	const firstName = $derived($settingsStore.profileFirstName.trim());

	/** Not derived: a reactive expression would re-roll on every update around it, and the line would flicker while somebody read it. */
	const line = heroLine($locale);

	/** A persona's conversation is reachable from the persona itself, one row up, so showing it here listed the same thing twice under two names. */
	const recent = $derived(($sessionsStore ?? []).filter((s) => !s.personaId).slice(0, 4));

	/** All of them, not only the ones already spoken to: otherwise a persona somebody has just written is hidden until they find another way to start. */
	const personas = $derived($personasStore ?? []);

	/** `launchPersona` reopens the conversation this persona has, or makes one with their prompt, greeting and model, so the voice screen is handed an id rather than talking into the air. */
	/**
	 * Whether the row of faces continues past an edge, and which one. Only ever
	 * answered by measuring: a guess would be a permanent hint on a row of three
	 * faces that fits.
	 */
	let row = $state<HTMLDivElement | null>(null);
	let more = $state<'none' | 'left' | 'right' | 'both'>('none');

	/** A few pixels of slack, so a scroll that stopped a hair short still counts. */
	const EDGE = 8;

	function measure() {
		const element = row;
		if (!element) return;

		const furthest = element.scrollWidth - element.clientWidth;
		if (furthest <= EDGE) {
			more = 'none';
			return;
		}

		const behind = element.scrollLeft > EDGE;
		const ahead = element.scrollLeft < furthest - EDGE;
		more = behind && ahead ? 'both' : behind ? 'left' : ahead ? 'right' : 'none';
	}

	$effect(() => {
		// Re-measured when the row's contents change: a persona added or removed
		// changes whether there is anything past the edge.
		if (personas.length) measure();
		else more = 'none';
	});

	$effect(() => {
		// And when the window does: a phone turned on its side is the one case where
		// the row stops overflowing without anybody touching it.
		const update = () => measure();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	async function talkTo(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models ?? []);
		// The id rides in the query rather than the path: the voice screen is one
		// screen whichever conversation it holds. In the URL rather than in a store, so
		// a reload lands back on the same conversation.
		//
		// The rule below watches for unresolved paths, and this one is resolved;
		// `resolve` has nowhere to put a query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${resolve('/m/voice')}?session=${encodeURIComponent(id)}`);
	}
</script>

<Head title={APP_NAME} />

<!-- The foot clears the floating bar, which is fixed. -->
<div class="flex flex-col gap-5 px-5 pt-4 pb-32">
	<!-- The two things a phone reaches for from a home screen that is not a list:
	     finding one conversation, and the account. Circular and in the same glass as
	     the bar at the foot, so the screen is bracketed by one material. -->
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
	     The orb is the body the voice screen fills the display with, small. -->
	<button
		type="button"
		onclick={() => goto(resolve('/m/voice'))}
		class="hero relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 text-left transition-transform active:scale-[0.99]"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<span class="text-active text-xl leading-tight font-semibold tracking-tight">
				{line}
			</span>
			<span class="text-muted text-xs leading-relaxed">{$LL.mobileHeroBody()}</span>
			<span
				class="bg-accent text-shade-0 mt-3 flex w-fit items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium"
			>
				<Mic class="h-3.5 w-3.5" />
				{$LL.mobileStartVoice()}
			</span>
		</div>

		<!-- A light behind it, and only here: on the voice screen the orb fills the
		     display and needs no help, while on a card among cards it read as something
		     switched off. Behind rather than brighter, so it stays the same object as on
		     the next screen. -->
		<span class="relative flex shrink-0 items-center justify-center">
			<span class="halo" aria-hidden="true"></span>
			<!-- In the accent, which it quietly was not: with no colour of its own the
			     canvas reads back the card's text colour and drew itself grey.

			     The rim is halved rather than removed. At nothing the shape dissolved into
			     the card; at full it is a circle drawn round a disc. -->
			<!-- Listening, always: the card invites you to speak, so the shape it shows
			     should be the one that answers. Deaf, since nothing here holds a
			     microphone, so it simply breathes. -->
			<Bloom class="relative h-32 w-32 shrink-0" phase="listening" />
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

	{#if personas.length}
		<!-- People rather than destinations: faces and names and nothing else. Scrolled
		     sideways because the number of them is somebody's business and not the
		     layout's. Straight into the voice screen, since reading their prompt in a
		     text box is the Library's job. -->
		<section class="flex flex-col gap-2">
			<h2 class="text-active text-lg font-semibold tracking-tight">{$LL.mobilePersonas()}</h2>

			<div
				bind:this={row}
				onscroll={measure}
				data-more={more}
				class="faces -mx-5 flex gap-3 overflow-x-auto px-5 pb-1"
			>
				{#each personas as persona (persona.id)}
					<button
						type="button"
						onclick={() => talkTo(persona)}
						class="face flex shrink-0 flex-col items-center gap-2 transition-transform active:scale-95"
					>
						<PersonaAvatar {persona} size={56} />
						<span class="text-muted w-full truncate text-center text-xs">{persona.name}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if recent.length}
		<section class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between gap-2">
				<h2 class="text-active text-lg font-semibold tracking-tight">{$LL.mobileRecent()}</h2>
				<a href={resolve('/m/sessions')} class="text-muted text-xs">{$LL.showMore()}</a>
			</div>

			<div class="flex flex-col gap-2">
				{#each recent as session (session.id)}
					<!-- One line, no border, no date: a home screen row has to be recognised and
					     tapped, and the list tab carries the detail. -->
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
	/*
	 * The row of faces scrolls, and says so by dissolving rather than by adding
	 * anything. No scrollbar: a bar under a row of portraits is furniture. A face
	 * cut off by the screen edge is ambiguous, since the screen edge cuts
	 * everything; a face dissolving before it reaches the edge is not.
	 *
	 * Both ends, separately, and neither when the row fits. `data-more` is measured,
	 * so three personas get no hint at all.
	 */
	.faces {
		scrollbar-width: none;
	}

	/*
	 * Four faces and two thirds of a fifth, whatever the phone is.
	 *
	 * A fixed width was why the fade said nothing: at 5rem a face, exactly four
	 * landed on a common screen and the row ended on a gap, so there was nothing to
	 * dissolve. Measured against the row instead: 4.5 shares of what is left after
	 * the gaps, which puts a face half past the edge at every width. The floor is
	 * for the narrowest phones.
	 */
	.face {
		width: max(4rem, calc((100% - 3rem) / 4.5));
	}

	.faces::-webkit-scrollbar {
		display: none;
	}

	/* Half a portrait, which is about what shows past the edge: the one that is only
	   partly there dissolves, and the four before it stay solid. */
	.faces[data-more='right'] {
		mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
	}

	.faces[data-more='left'] {
		mask-image: linear-gradient(to left, black calc(100% - 2.5rem), transparent);
		-webkit-mask-image: linear-gradient(to left, black calc(100% - 2.5rem), transparent);
	}

	.faces[data-more='both'] {
		mask-image: linear-gradient(
			to right,
			transparent,
			black 2.5rem,
			black calc(100% - 2.5rem),
			transparent
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			black 2.5rem,
			black calc(100% - 2.5rem),
			transparent
		);
	}

	/* The same glass as the bar at the foot, and it now genuinely is: the two had
	   drifted to different tints, these buttons sitting a shade denser than the bar
	   under them. Still local to this file, which is what let them diverge: four
	   screens repeat this block. */
	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 42%, transparent);
		backdrop-filter: blur(32px) saturate(190%);
		-webkit-backdrop-filter: blur(32px) saturate(190%);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-shade-4) 45%, transparent);
	}

	:global([data-color-theme='dark']) .glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 48%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
			0 0 0 1px color-mix(in srgb, white 8%, transparent);
	}

	/* A wash rather than a border, and it leans: the one surface on the screen that
	   is not a bordered box. */
	.hero {
		border: 1px solid color-mix(in srgb, var(--color-accent) 24%, transparent);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 20%, transparent),
			color-mix(in srgb, var(--color-accent) 6%, transparent) 55%,
			color-mix(in srgb, var(--color-accent) 14%, transparent)
		);
	/*
	 * The light the orb sits in, on this card and nowhere else.
	 *
	 * Its own element behind the shape rather than a change to the shape, so the orb
	 * is the same object here as on the voice screen. The card already clips, so it
	 * reaches the edges and reads as light in the card rather than a circle on it.
	 *
	 * One colour throughout: the orb's own colour is what says which state the app
	 * is in. Brightest at the middle and fading the whole way out, so the light
	 * passes through the translucent orb and the two read as one mass.
	 */
	 * and the two read as one luminous mass.
	 */
	.halo {
		position: absolute;
		inset: -55%;
		border-radius: 9999px;
		pointer-events: none;
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--color-accent) 62%, transparent) 0%,
			color-mix(in srgb, var(--color-accent) 46%, transparent) 24%,
			color-mix(in srgb, var(--color-accent) 24%, transparent) 46%,
			color-mix(in srgb, var(--color-accent) 9%, transparent) 66%,
			transparent 88%
		);
		/* Held back from the centre and blurred less: past a point, more glow stops
	   adding presence and starts removing the object. */
		filter: blur(9px);
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

	/* Two clocks, so the light never settles. The floor is high: this is the
	   brightest thing on the page and is meant to be. */
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
