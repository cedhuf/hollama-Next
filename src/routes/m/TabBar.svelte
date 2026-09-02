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
	 * The voice key is separate, on the left, in the accent, because it is not a
	 * destination: in the row it would make talking one option among four. Only the
	 * current destination carries its name, which is what lets four fit, and the
	 * label slides open so moving between two reads as one object travelling.
	 *
	 * The pill under the current tab is `shade-3` rather than `shade-2`, the colour
	 * of the page this floats over: at `shade-2` the fill landed within two points
	 * of lightness of the bar around it.
	 */
	const tabs = $derived([
		{ href: '/m' as const, icon: House, label: $LL.mobileTabHome() },
		{ href: '/m/sessions' as const, icon: MessagesSquare, label: $LL.mobileTabChats() },
		...($canDrawImages ? [{ href: '/m/images' as const, icon: Images, label: $LL.images() }] : []),
		{
			href: '/m/profile' as const,
			icon: User,
			label: $LL.mobileTabProfile(),
			// The Library is reached from Profile and belongs to it. Without this the bar
			// had no current destination while you were in there.
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
	<!-- Two objects, not one, and the left one never moves: the row is anchored left
	     rather than centred, so only the pill's far edge moves when the label under
	     the thumb changes. -->
	<div class="pointer-events-auto flex w-full items-center gap-2">
		<button
			type="button"
			onclick={() => goto(resolve('/m/voice'))}
			aria-label={$LL.mobileVoice()}
			class="glass text-accent flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Mic class="h-5 w-5" />
		</button>

		<!-- The bar takes what is left of the line rather than the width of its labels: a
		     row that resizes under the thumb is a row whose targets move while it is
		     being aimed at. Inside it, the slack goes to the tab that needs it. -->
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
					<!-- Grid rather than width: a `max-width` transition has to guess a number, and
					     the guess is wrong for every language but the one it was measured in. -->
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
	 * Glass, the way the platform draws it: a heavy blur so what passes behind is
	 * texture rather than content, a push on saturation because blurring alone
	 * drains colour, and a hairline of light along the top edge.
	 *
	 * The tint is as low as it can be and still hold an icon: lower fails over a
	 * photograph, where an icon disappears into the bright half.
	 */
	/*
	 * For whoever adds page transitions, because it has been tried and undone.
	 * `backdrop-filter` and the View Transitions API do not coexist: during a
	 * transition the document is replaced by snapshots, so this bar went clear for
	 * every navigation, and a `view-transition-name` made the glass vanish
	 * permanently on iOS.
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
