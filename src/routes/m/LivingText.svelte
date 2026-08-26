<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * A line of text with something living in it.
	 *
	 * Nothing here is a transform, and that is the point of the whole component.
	 *
	 * The obvious versions of this idea all move boxes: scale the letter, shift it,
	 * drive both from a frame loop. Every one was tried and every one flashed,
	 * because writing `translate` or `scale` on two dozen inline-blocks promotes
	 * each to its own compositing layer and the text snaps between rasterisations.
	 * There is no amplitude at which that stops.
	 *
	 * So the letters never move. A font axis changes the outlines in place: `YTLC`
	 * raises the height of the lowercase, `YTAS` raises the ascenders, and both are
	 * parametric axes built to leave advance widths alone, so the line does not
	 * recompose. `wght` is deliberately not in the font file for exactly that
	 * reason: it would be the obvious third axis and it would set the line jittering
	 * sideways.
	 *
	 * That is also what makes a frame loop safe here where it was not before. This
	 * one writes `font-variation-settings`, which promotes nothing.
	 *
	 * And a loop is needed, because CSS cannot express the thing that makes this
	 * read as alive. Keyframes give every letter the same path at a different
	 * offset, which is a conveyor: twenty-five copies of one motion, repeating
	 * exactly, findable as a pattern in a few seconds however slowly it runs. What
	 * is written below instead is the orb's own construction, laid along a line.
	 *
	 * Six axes move, and no two of them on the same clock: a shared period would make
	 * two of them one behaviour seen twice. The heights of the lowercase, the
	 * ascenders, the capitals and the descenders, plus the weight of the strokes and
	 * a degree or so of lean. Every one leaves advance widths alone, which is the
	 * selection criterion rather than a happy accident.
	 *
	 * Four things do the work, and each is answering a different way of looking
	 * mechanical.
	 *
	 * Several waves per axis, at periods that do not divide into each other, two of
	 * them travelling in opposite directions along the line. Nothing repeats and no
	 * crest reads as sweeping past.
	 *
	 * A hash per letter, feeding one slow term. Without it the letters are the same
	 * function twenty-five times; with it each has an idiosyncrasy nothing else
	 * shares.
	 *
	 * A lopsided wave rather than a sine, rising faster than it falls. Tissue does
	 * that and a spring does not.
	 *
	 * And one very slow swell that every letter shares, so they are parts of one
	 * body rather than a crowd of separate ones. That last is most of the
	 * difference between an effect and a creature.
	 */
	interface Props {
		text: string;
		class?: string;
		/**
		 * The length past which the line is simply drawn.
		 *
		 * Every letter holds a different set of axis values, so every letter is a
		 * separate glyph to rasterise, and rasterising is the one part of this that
		 * is not cheap. A short label is nothing; a four-hundred-character answer is
		 * four hundred distinct glyphs redrawn as they drift, on a phone.
		 *
		 * So there is a ceiling, and past it the text is rendered plainly in the same
		 * face. Nothing is lost that anybody wanted: a paragraph somebody is reading
		 * should hold still anyway, and it is the short lines, the ones that are
		 * more sign than sentence, where this belongs.
		 */
		limit?: number;
	}

	let { text, class: className = '', limit = 140 }: Props = $props();

	const alive = $derived(text.length <= limit);

	let host: HTMLElement | undefined = $state();

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
			at++; // The motion keeps its stride across the gap.
			return letters;
		});
	});

	/**
	 * Every axis this line moves, and how each one moves.
	 *
	 * A table rather than six blocks of arithmetic, so adding or dropping an axis is
	 * a line and the frequencies can be read side by side and kept apart. Nothing in
	 * here shares a period with anything else in here, which is the only property
	 * that matters: two axes on the same clock are one behaviour seen twice.
	 *
	 * Every one of them leaves advance widths alone. That is not a coincidence, it is
	 * the selection criterion. `wght` and `wdth` would be the obvious additions and
	 * both move widths, which would recompose the line on every frame.
	 *
	 * `waves` are `[how fast in time, how fast along the line, how much]`. A negative
	 * middle figure sends that wave the other way down the line, and having some of
	 * each is what stops any of it reading as a sweep. The first wave of each axis is
	 * the lopsided one.
	 *
	 * `body` is how much this axis answers to the swell the whole line shares.
	 */
	const AXES = [
		{
			tag: 'YTLC', // The height of the lowercase.
			mid: 493,
			swing: 78,
			low: 418,
			high: 568,
			round: 0,
			waves: [
				[0.47, 0.62, 0.42],
				[0.79, -0.37, 0.28],
				[0.29, 0.17, 0.18]
			],
			body: 0.26
		},
		{
			tag: 'YTAS', // The height of the ascenders.
			mid: 751,
			swing: 100,
			low: 654,
			high: 848,
			round: 0,
			waves: [
				[0.61, -0.51, 0.44],
				[0.37, 0.28, 0.3],
				[0.23, -0.11, 0.2]
			],
			body: 0.22
		},
		{
			tag: 'GRAD', // The weight of the strokes, with the metrics held.
			mid: 10,
			swing: 76,
			low: -78,
			high: 98,
			round: 0,
			waves: [
				[0.53, 0.44, 0.4],
				[0.89, -0.29, 0.26],
				[0.19, 0.09, 0.24]
			],
			body: 0.3
		},
		{
			tag: 'slnt', // Degrees of lean. Upright is nought and the font only goes one way.
			mid: -1.2,
			swing: 1.2,
			low: -2.4,
			high: 0,
			round: 2,
			waves: [
				[0.41, -0.58, 0.46],
				[0.67, 0.33, 0.3],
				[0.31, -0.15, 0.2]
			],
			body: 0.14
		},
		{
			tag: 'YTUC', // The height of the capitals, so the first letter lives too.
			mid: 712,
			swing: 44,
			low: 664,
			high: 758,
			round: 0,
			waves: [
				[0.73, 0.39, 0.5],
				[0.43, -0.21, 0.34]
			],
			body: 0.2
		},
		{
			tag: 'YTDE', // How far the descenders drop.
			mid: -200,
			swing: 54,
			low: -258,
			high: -142,
			round: 0,
			waves: [
				[0.59, -0.47, 0.48],
				[0.27, 0.19, 0.32]
			],
			body: 0.18
		}
	];

	/**
	 * A number between nought and one that is this letter's and no other's.
	 *
	 * The usual hash, and its only job is to be arbitrary. Without it every letter is
	 * running the same function with a different phase, which is twenty-five copies
	 * of one thing on a conveyor: legible as a pattern within a few seconds however
	 * slowly it moves. With it, each has an idiosyncrasy of its own.
	 */
	function own(index: number): number {
		const value = Math.sin(index * 12.9898) * 43758.5453;
		return value - Math.floor(value);
	}

	/**
	 * A wave that is not a sine.
	 *
	 * A second harmonic folded in, which makes the shape lopsided: it rises faster
	 * than it falls. Living tissue does that, a spring does not, and the eye knows
	 * the difference long before it can say why.
	 */
	function lopsided(phase: number): number {
		return Math.sin(phase) + 0.35 * Math.sin(2 * phase + 0.7);
	}

	const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

	onMount(() => {
		const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
		let frame = 0;
		let glyphs: HTMLElement[] = [];
		let known = '';
		/** The last value written, so a frame that changes nothing writes nothing. */
		let last: string[] = [];

		const tick = (now: number) => {
			frame = requestAnimationFrame(tick);
			if (!host || document.hidden) return;

			if (known !== text) {
				known = text;
				glyphs = [...host.querySelectorAll<HTMLElement>('[data-glyph]')];
				last = new Array(glyphs.length).fill('');
			}
			if (!glyphs.length || calm.matches) return;

			const t = now / 1000;

			/**
			 * One slow swell the whole line shares.
			 *
			 * Without it the letters are twenty-five separate creatures. With it they
			 * are parts of one, which is the difference between a crowd and a body.
			 * Two terms, half a minute and three quarters of one, so the shared state
			 * never settles either.
			 */
			const body = Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.13 + 1.7) * 0.3;

			for (let i = 0; i < glyphs.length; i++) {
				const mine = own(i) * 6.28;

				let next = '';
				for (const axis of AXES) {
					let sum = axis.body * body;
					for (let w = 0; w < axis.waves.length; w++) {
						const [rate, along, amount] = axis.waves[w];
						// This letter's own offset rides on the slowest wave of each axis,
						// where it drifts rather than jitters.
						const phase = t * rate + i * along + (w === axis.waves.length - 1 ? mine : 0);
						sum += amount * (w === 0 ? lopsided(phase) : Math.sin(phase));
					}
					const value = clamp(axis.mid + sum * axis.swing, axis.low, axis.high);
					next += `${next ? ', ' : ''}'${axis.tag}' ${value.toFixed(axis.round)}`;
				}

				// Rounded to the coarsest step each axis can show, and compared before
				// writing. The values move slowly, so most frames change nothing, and a
				// style written for nothing is a style recalculation for nothing.
				if (next === last[i]) continue;
				last[i] = next;
				glyphs[i].style.fontVariationSettings = next;
			}
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

{#if alive}
	<!-- Hidden from assistive tech: spelled one letter per element, it would be read
	     out as letters. Whatever contains this carries the sentence. -->
	<span bind:this={host} class="living {className}" aria-hidden="true"
		>{#each words as letters, word (word)}<span class="word"
				>{#each letters as item (item.at)}<span class="glyph" data-glyph>{item.letter}</span
					>{/each}</span
			>{#if word < words.length - 1}<span class="gap"></span>{/if}{/each}</span
	>
{:else}
	<!-- Past the ceiling, and readable rather than hidden: this one is a paragraph
	     somebody is actually reading, so it keeps its place in the document. -->
	<span class="living {className}">{text}</span>
{/if}

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

	/* On the line rather than on the letters, so a text past the ceiling is set in
	   the same face as one under it. One screen, one voice. */
	.living {
		font-family: 'Roboto Flex Live', var(--font-sans);
	}

	.glyph {
		display: inline-block;
		/* A letter that happens to be a space still has to hold its width. */
		white-space: pre;
		/* The axes are written from a frame loop rather than animated here. Keyframes
		   can only give every letter the same path at a different offset, which is a
		   conveyor; the loop gives each one a sum of waves that no other letter is
		   tracing. See the note at the top of the file. */
		font-variation-settings:
			'YTLC' 493,
			'YTAS' 751,
			'GRAD' 10,
			'slnt' -1.2,
			'YTUC' 712,
			'YTDE' -200;
	}

	/* The loop leaves the letters alone here, so what is drawn is the neutral pair
	   set above and the line simply sits still. */
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
