<script lang="ts">
	import { House, Images, MessagesSquare, Mic, User } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canDrawImages } from '$lib/images';

	/**
	 * The way around, floating over the content at thumb height.
	 *
	 * Two things make it a bar rather than a row of buttons. The voice key is
	 * separate, on the left, in the accent, because it is not a destination: it
	 * opens the way this interface is meant to be used, and putting it in the row
	 * would have made talking one option among four. And only the current
	 * destination carries its name, the others being their icon alone, which is
	 * what lets four fit at this width without either shrinking or abbreviating.
	 *
	 * The label slides open rather than appearing, so moving between two
	 * destinations reads as one object travelling rather than two labels swapping.
	 *
	 * The pill under the current tab is `shade-3` and not the obvious `shade-2`,
	 * which is what it was and which drew nothing. `shade-2` is the colour of the
	 * page this bar floats over, and the glass tint barely moves away from it: the
	 * fill landed within two points of lightness of the bar around it, in both
	 * themes, so the only thing marking the current destination was its label
	 * opening. One step further along the scale is enough to read as a pill in both
	 * themes, and it is as far as this should go: the mark under a thumb only has
	 * to be found, not announced.
	 */
	const tabs = $derived([
		{ href: '/m' as const, icon: House, label: $LL.mobileTabHome() },
		{ href: '/m/sessions' as const, icon: MessagesSquare, label: $LL.mobileTabChats() },
		...($canDrawImages ? [{ href: '/m/images' as const, icon: Images, label: $LL.images() }] : []),
		{
			href: '/m/profile' as const,
			icon: User,
			label: $LL.mobileTabProfile(),
			// The Library is reached from Profile and belongs to it. Without this the
			// bar had no current destination at all while you were in there, so every
			// label was closed and the row read as four icons and nothing chosen.
			owns: ['/m/library']
		}
	]);

	const isCurrent = (tab: { href: string; owns?: string[] }) => {
		const path = page.url.pathname;
		if (tab.owns?.some((owned) => path === owned || path.startsWith(`${owned}/`))) return true;
		return tab.href === '/m' ? path === '/m' : path.startsWith(tab.href);
	};
</script>

<nav
	class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex px-4 pb-[max(1rem,var(--safe-bottom))]"
	aria-label={$LL.mobileTabChats()}
>
	<!-- Two objects, not one, and the left one never moves.
	     
	     The row is anchored left rather than centred: the pill grows and shrinks as
	     the label under the thumb changes, and a centred row would have slid the
	     microphone sideways every time somebody changed tab. Pinned first in a
	     left-aligned row, only the pill's far edge moves.
	     
	     The voice key is its own object because it is not a destination: it opens
	     the way this interface is meant to be used, and sitting inside the row would
	     have made talking one option among four. Same height and same corner as the
	     tabs, so the pair reads as one instrument in two pieces. -->
	<div class="pointer-events-auto flex w-full items-center gap-2">
		<button
			type="button"
			onclick={() => goto(resolve('/m/voice'))}
			aria-label={$LL.mobileVoice()}
			class="glass text-accent flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Mic class="h-5 w-5" />
		</button>

		<!-- The bar takes what is left of the line rather than the width of its
		     labels: a row that resizes itself under the thumb is a row whose targets
		     move while it is being aimed at.
		     
		     Inside it, the slack goes to the tab that needs it. Equal shares looked
		     tidier and cut every label in half: three quarters of the bar was held by
		     icons that needed forty pixels each. -->
		<div class="glass flex min-w-0 flex-1 items-center gap-1 rounded-full p-1.5">
			{#each tabs as tab (tab.href)}
				{@const Icon = tab.icon}
				{@const active = isCurrent(tab)}
				<a
					href={resolve(tab.href)}
					aria-current={active ? 'page' : undefined}
					aria-label={tab.label}
					class="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-3 transition-colors duration-200 {active
						? 'bg-shade-3 text-active flex-1'
						: 'text-muted hover:text-active shrink-0'}"
				>
					<Icon class="h-5 w-5 shrink-0" />
					<!-- Grid rather than width: a `max-width` transition has to guess a
					     number, and the guess is wrong for every language but the one it was
					     measured in. A grid track animates from nothing to the text's own
					     size, whatever that turns out to be. -->
					<span
						class="grid transition-[grid-template-columns] duration-200 ease-out {active
							? 'grid-cols-[1fr]'
							: 'grid-cols-[0fr]'}"
					>
						<span class="truncate text-sm whitespace-nowrap">{tab.label}</span>
					</span>
				</a>
			{/each}
		</div>
	</div>
</nav>

<style lang="postcss">
	/*
	 * Glass, the way the platform draws it.
	 *
	 * Three things together, and it needs all three. A heavy blur, so what passes
	 * behind becomes texture rather than content competing with the icons. A push
	 * on saturation, because blurring alone drains colour and the result reads as a
	 * dirty window rather than as glass. And a hairline of light along the top
	 * edge, which is what a pane of glass does with the light above it and the one
	 * detail that makes the difference between translucent and merely transparent.
	 *
	 * The tint is as low as it can be and still hold an icon. Lower is prettier
	 * over a plain background and fails over a photograph: a blurred image keeps
	 * its light and dark patches, so an icon crossing one lands on whatever happens
	 * to be behind it and disappears into the bright half. The tint is what stops
	 * the backdrop reaching the extremes, and it is doing that job rather than a
	 * decorative one. Anything much heavier and the blur is decoration over an
	 * opaque bar, which is the thing this replaces.
	 */
	/*
	 * A note for whoever adds page transitions, because it has been tried and undone.
	 *
	 * `backdrop-filter` and the View Transitions API do not coexist. During a
	 * transition the whole document is replaced by snapshots, so an element that
	 * blurs what is behind it has nothing behind it, and this bar went clear for the
	 * length of every navigation. Giving it a `view-transition-name` to hold it out
	 * of the snapshot is worse: a named element is its own stacking context and
	 * containing block, and on iOS the glass then vanished permanently rather than
	 * for a moment.
	 *
	 * There is no third setting. Either the transitions go, which is what happened,
	 * or this stops being glass.
	 */
	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 42%, transparent);
		backdrop-filter: blur(32px) saturate(190%);
		-webkit-backdrop-filter: blur(32px) saturate(190%);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-shade-4) 45%, transparent),
			0 8px 28px -10px rgb(0 0 0 / 0.35);
	}

	/* Dark themes take a firmer tint and a fainter highlight: the same 45% of white
	   along the top edge reads as a chrome strip against a dark backdrop. */
	:global([data-color-theme='dark']) .glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 48%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
			0 0 0 1px color-mix(in srgb, white 8%, transparent),
			0 8px 28px -10px rgb(0 0 0 / 0.6);
	}
</style>
