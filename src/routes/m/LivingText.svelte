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
	 * Nothing here is a transform, and that is the point of the whole component.
	 *
	 * The obvious versions of this idea all move boxes: scale the letter, shift it,
	 * drive both from a frame loop the way the orb is drawn. Every one of them was
	 * tried and every one flashed, because writing `translate` and `scale` on two
	 * dozen inline-blocks promotes each to its own compositing layer and the text
	 * snaps between rasterisations. There is no amplitude at which that stops.
	 *
	 * So the letters do not move at all. A font axis changes the outlines in place:
	 * `YTLC` raises the height of the lowercase, `YTAS` raises the ascenders, and
	 * both are parametric axes designed to leave advance widths alone, so the line
	 * does not recompose. Nothing is promoted, nothing is transformed, and the
	 * shapes themselves grow, which is what was being imitated all along.
	 *
	 * `wght` is deliberately absent from the file. It would be the obvious third
	 * axis and it changes advance widths, which would set the line jittering
	 * sideways on every frame.
	 *
	 * The keyframes run forwards rather than `alternate`, and their stops are at
	 * deliberately uneven positions. A wave that reverses retraces its own path
	 * exactly, and a regular one has a beat the eye finds within seconds; either is
	 * enough to make the whole thing read as a mechanism. Landing back on the
	 * starting values at the end is what lets it loop without a seam.
	 *
	 * If the font never arrives, `font-variation-settings` falls on a face with no
	 * such axes and does nothing at all. The line is then simply still, which is a
	 * fine thing for it to be.
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
	/*
	 * Declared here rather than in the global sheet, unlike the app's other faces.
	 *
	 * A component's styles are loaded with the component, so a font that serves one
	 * line on one screen is not announced on every page in the app. The file itself
	 * still lives with the others under `static/fonts`, where its README explains
	 * which axes it kept and how it was cut.
	 */
	@font-face {
		font-family: 'Roboto Flex Live';
		src: url('/fonts/roboto-flex/roboto-flex-latin.woff2') format('woff2');
		font-weight: 400;
		font-style: normal;
		/* The line is decorative and short. Better the fallback immediately and a
		   swap a moment later than a gap where the status should be. */
		font-display: swap;
		unicode-range:
			U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329,
			U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
	}

	.glyph {
		display: inline-block;
		/* A letter that happens to be a space still has to hold its width. */
		white-space: pre;
		font-family: 'Roboto Flex Live', var(--font-sans);
		animation: glyph-live 11.3s ease-in-out infinite;
		/* The position along the line becomes a delay, which is what turns one
		   animation into something arriving at one letter after another. Negative, so
		   a line that has just changed comes in already mid-wave rather than flat. */
		animation-delay: calc(var(--i) * -0.14s);
	}

	/*
	 * Two axes, out of step with each other, on uneven stops.
	 *
	 * The heights cross rather than rise together: the lowercase peaks early in the
	 * cycle, the ascenders around a third later, and each troughs while the other is
	 * still high. A letter therefore changes proportion and not merely size, which is
	 * the difference between something growing and something being zoomed.
	 *
	 * Close to the full travel of both axes, `YTLC` between 416 and 570 and `YTAS`
	 * between 649 and 854. There is nothing to be gained by holding back: unlike a
	 * geometric stretch, every value in here is a shape the type designer drew, so
	 * the extremes are letters rather than damage.
	 *
	 * `ease-in-out` rather than `linear`, and it is doing real work. It brings the
	 * motion to a stop at every keyframe, so each turning point is a pause rather
	 * than a corner, and the loop closes on itself without a kick. The stops being
	 * unevenly spaced is what keeps those pauses from becoming a beat.
	 */
	@keyframes glyph-live {
		0% {
			font-variation-settings:
				'YTLC' 500,
				'YTAS' 750;
		}
		17% {
			font-variation-settings:
				'YTLC' 566,
				'YTAS' 700;
		}
		38% {
			font-variation-settings:
				'YTLC' 452,
				'YTAS' 846;
		}
		54% {
			font-variation-settings:
				'YTLC' 534,
				'YTAS' 712;
		}
		73% {
			font-variation-settings:
				'YTLC' 422,
				'YTAS' 802;
		}
		89% {
			font-variation-settings:
				'YTLC' 522,
				'YTAS' 658;
		}
		100% {
			font-variation-settings:
				'YTLC' 500,
				'YTAS' 750;
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
