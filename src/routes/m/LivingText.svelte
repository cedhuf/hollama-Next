<script lang="ts">
	/**
	 * A line of text with a wave running through it.
	 *
	 * Every letter carries its position along the line, the position becomes an
	 * animation delay, and the deformation therefore arrives at one letter after
	 * another rather than lifting the whole line at once. Two waves at lengths that
	 * do not divide into each other, so the pair never puts the same shape in the
	 * same place twice.
	 *
	 * The motion is a scale from the baseline. Scaled about its centre a letter
	 * shrinks into itself and swells back out, which reads as a wobble; scaled from
	 * the foot it rises off a line the others are still sitting on, which is what a
	 * letter getting taller looks like.
	 *
	 * A note for whoever tries to improve this, because it has been tried. Driving
	 * the letters from a frame loop instead, with a sum of sines the way the orb is
	 * drawn, is the obvious next idea and it is worse: writing `translate` and
	 * `scale` on two dozen inline-blocks every frame promotes each one to its own
	 * layer, and the text snaps between rasterisations. It flashes. The honest fix
	 * for the mechanical feel is not a better loop, it is a font with a height axis,
	 * which changes the letterforms in place and moves no boxes at all.
	 */
	interface Props {
		text: string;
		class?: string;
	}

	let { text, class: className = '' }: Props = $props();

	/**
	 * Cut into letters, kept in words.
	 *
	 * The words matter for wrapping: the letters are inline-block, so the line may
	 * break between any two of them, and inside a circle that would break words
	 * wherever the width ran out.
	 */
	const words = $derived.by(() => {
		let at = 0;
		return text.split(' ').map((word) => {
			const letters = [...word].map((letter) => ({ letter, at: at++ }));
			at++; // The space, so the motion keeps its stride across the gap.
			return letters;
		});
	});
</script>

<!-- Hidden from assistive tech: spelled one letter per element, it would be read
     out as letters. Whatever contains this carries the sentence. -->
<span class={className} aria-hidden="true"
	>{#each words as letters, word (word)}<span class="word"
			>{#each letters as item (item.at)}<span class="glyph" style="--i: {item.at}"
					>{item.letter}</span
				>{/each}</span
		>{#if word < words.length - 1}<span class="gap"></span>{/if}{/each}</span
>

<style lang="postcss">
	.glyph {
		display: inline-block;
		/* A letter that happens to be a space still has to hold its width. */
		white-space: pre;
		transform-origin: 50% 100%;
		animation:
			glyph-tall 4.9s ease-in-out infinite alternate,
			glyph-lift 7.7s ease-in-out infinite alternate;
		/* Wide enough apart that the crest is visibly travelling. Too small a step and
		   every letter is near enough in phase with its neighbour that the line simply
		   breathes as one. */
		animation-delay: calc(var(--i) * -0.14s), calc(var(--i) * -0.21s);
	}

	@keyframes glyph-tall {
		from {
			scale: 1 0.84;
		}
		to {
			scale: 1 1.24;
		}
	}

	@keyframes glyph-lift {
		from {
			translate: 0 0.05em;
		}
		to {
			translate: 0 -0.05em;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.glyph {
			animation: none;
		}
	}

	/* Held together so the line breaks between words and never inside one. */
	.word {
		display: inline-block;
		white-space: nowrap;
	}

	/*
	 * The space between two words, drawn rather than typed.
	 *
	 * A span holding a literal space compiles to an empty span: Svelte trims
	 * whitespace at the edges of an element's content, and a lone space is nothing
	 * but edges. A width cannot be trimmed away. It is also the only place the line
	 * may break, which is why the letters inside a word are held and this is not.
	 */
	.gap {
		display: inline-block;
		width: 0.28em;
	}
</style>
