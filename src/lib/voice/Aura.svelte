<script lang="ts">
	import { onMount } from 'svelte';

	import { SILENCE, type Reading } from '$lib/audioReading';

	/**
	 * The voice, as light rather than as a shape.
	 *
	 * A body of turbulent colour that thickens where the sound is. Drawn on the
	 * GPU because that is the only way to have every pixel move independently at
	 * sixty frames a second: the same effect in canvas 2D is a handful of blurred
	 * discs on orbits, which reads as decoration rather than as something speaking.
	 *
	 * The mechanism is domain warping. A noise field is sampled, the result is used
	 * to displace where the next sample is taken from, and that twice over. It is
	 * three lines of shader and it is what makes the difference between smoke and a
	 * gradient: nothing in the image travels in a straight line.
	 *
	 * What the audio actually does, and it is deliberately restrained. Loudness
	 * pushes the body outward and brightens it; the spectrum tilts the hue, so a
	 * bright consonant reads warmer than a vowel. It never changes the speed. A
	 * shape that sped up when somebody spoke would read as agitation, and it is
	 * listening, not panicking.
	 */
	interface Props {
		/**
		 * Where the sound is, asked once per frame.
		 *
		 * A function rather than a value, the same contract the orb has: this
		 * redraws sixty times a second, and pushing sixty readings a second through
		 * reactive state would wake the whole page to animate one canvas.
		 */
		sample?: () => Reading;
		/**
		 * What is happening, for the parts no reading can express.
		 *
		 * `thinking` is the one state with no sound at all, and it must not look like
		 * silence: a body that goes still while a model is working reads as an app
		 * that has crashed. It gets a slow breath of its own instead.
		 */
		phase?: 'idle' | 'listening' | 'thinking' | 'speaking';
		class?: string;
		/**
		 * Anything the caller wants on the element, which in practice is its colour.
		 *
		 * The drawing reads `color` back off the canvas every frame, so a caller that
		 * wants a different hue sets one here and needs no property of its own. That
		 * is also what lets a colour be computed rather than named.
		 */
		style?: string;
	}

	let { sample, phase = 'idle', class: className = '', style = '' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);

	const VERTEX = `
		attribute vec2 position;
		void main() { gl_Position = vec4(position, 0.0, 1.0); }
	`;

	/**
	 * The whole of the look, in one pass.
	 *
	 * Read from the bottom up: `main` builds a radius that the noise has pushed
	 * around, turns it into a soft edge, and tints it. Everything above is the
	 * noise that does the pushing.
	 */
	const FRAGMENT = `
		precision highp float;

		uniform vec2 uSize;
		uniform float uTime;
		uniform float uLevel;
		uniform float uCalm;
		uniform vec3 uWarm;
		uniform vec3 uCool;

		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
		}

		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			vec2 u = f * f * (3.0 - 2.0 * f);
			return mix(
				mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
				mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
				u.y
			);
		}

		float fbm(vec2 p) {
			float total = 0.0;
			float amplitude = 0.5;
			for (int i = 0; i < 4; i++) {
				total += noise(p) * amplitude;
				p *= 2.03;
				amplitude *= 0.5;
			}
			return total;
		}

		void main() {
			vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / min(uSize.x, uSize.y);
			float dist = length(uv);
			float angle = atan(uv.y, uv.x);

			// Sampled on the circle itself rather than on the angle, so the noise
			// meets itself where the ring closes. Feeding an angle straight into a
			// noise field puts a seam at pi, which on a ring is a visible kink that
			// never moves.
			vec2 around = vec2(cos(angle), sin(angle));
			float t = uTime * 0.13;
			float wobble = fbm(around * 1.7 + vec2(t, -t)) - 0.5;
			float ripple = fbm(around * 3.4 - vec2(t * 1.7, t)) - 0.5;

			// The ring: a radius that breathes and is pushed around by the noise, and
			// a thickness that opens with the voice. Hollow, and that is the whole
			// difference from what was here before. A filled body reads as a blob;
			// what carries a voice is a band with nothing inside it.
			float breath = 0.010 * sin(uTime * 0.7) * uCalm;
			float radius = 0.30 + breath + wobble * 0.055 + ripple * 0.022 + uLevel * 0.02;
			float band = abs(dist - radius);

			float thickness = 0.018 + uLevel * 0.030 + (ripple + 0.5) * 0.012;

			// Two falloffs on the same band. The core is the filament, the bloom is
			// the light it throws, and the ratio between them is what makes it read as
			// something glowing rather than a stroked circle.
			float core = smoothstep(thickness, 0.0, band);
			float bloom = smoothstep(thickness * 5.5, 0.0, band);

			// Iridescence around the circumference, turning slowly, so no two points
			// on the ring are the same colour and the whole thing drifts.
			float shade = 0.5 + 0.5 * sin(angle * 1.6 + uTime * 0.5 + wobble * 4.0);
			vec3 tint = mix(uCool, uWarm, shade);

			// Brightness lives in the filament. Painting the bloom this brightly is
			// what turned the last version grey: a wide, dim, desaturated wash over
			// the page background is exactly the colour of dirt.
			vec3 colour = tint * (0.55 + core * 0.9);

			float alpha = core * 0.95 + bloom * 0.22;

			// Nothing survives to the edge of the quad, whatever the noise does. The
			// alternative is a straight line across the corner on a loud syllable.
			alpha *= smoothstep(0.48, 0.36, dist);

			gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0));
		}
	`;

	onMount(() => {
		const element = canvas;
		if (!element) return;

		const gl = element.getContext('webgl', {
			alpha: true,
			antialias: false,
			premultipliedAlpha: false
		});
		// No WebGL is not a broken screen: the caller draws its own fallback if it
		// wants one, and an empty canvas is better than a half-drawn effect.
		if (!gl) return;

		const program = build(gl);
		if (!program) return;

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

		const position = gl.getAttribLocation(program, 'position');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

		const uniform = (name: string) => gl.getUniformLocation(program, name);
		const uSize = uniform('uSize');
		const uTime = uniform('uTime');
		const uLevel = uniform('uLevel');
		const uCalm = uniform('uCalm');
		const uWarm = uniform('uWarm');
		const uCool = uniform('uCool');

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// Smoothed here rather than in the shader, because the smoothing has to
		// remember the frame before and a fragment shader remembers nothing. Fast
		// attack, slow release: a voice should arrive on the consonant and fade out
		// of the shape rather than snap back to nothing between syllables.
		let level = 0;
		let frame = 0;
		const started = performance.now();

		const resize = () => {
			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			const width = Math.round(element.clientWidth * ratio);
			const height = Math.round(element.clientHeight * ratio);
			if (element.width === width && element.height === height) return;
			element.width = width;
			element.height = height;
			gl.viewport(0, 0, width, height);
		};

		const draw = () => {
			frame = requestAnimationFrame(draw);
			resize();

			const reading = sample?.() ?? SILENCE;
			const target = phase === 'thinking' ? 0.12 : reading.level;
			level += (target - level) * (target > level ? 0.35 : 0.06);

			const colour = read(element);
			gl.useProgram(program);
			gl.uniform2f(uSize, element.width, element.height);
			gl.uniform1f(uTime, (performance.now() - started) / 1000);
			gl.uniform1f(uLevel, level);
			// Only when nothing else is moving it, so a breath and a voice never fight.
			gl.uniform1f(uCalm, phase === 'idle' || phase === 'thinking' ? 1 : 0.25);
			// The two ends of the iridescence, a hue apart either side of whatever
			// colour the element was given. Spread here rather than in the shader
			// because a hue rotation is a colour-space job and GLSL has no notion of
			// one: doing it by swizzling channels gives a second colour that is a
			// different hue by accident rather than by an angle.
			const warm = turn(colour, 0.11);
			const cool = turn(colour, -0.13);
			gl.uniform3f(uWarm, warm[0], warm[1], warm[2]);
			gl.uniform3f(uCool, cool[0], cool[1], cool[2]);

			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		};

		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	});

	/** Compile both stages, or nothing, having said what was wrong. */
	function build(gl: WebGLRenderingContext): WebGLProgram | null {
		const compile = (kind: number, source: string) => {
			const shader = gl.createShader(kind);
			if (!shader) return null;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
			console.error('aura shader:', gl.getShaderInfoLog(shader));
			return null;
		};

		const vertex = compile(gl.VERTEX_SHADER, VERTEX);
		const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
		if (!vertex || !fragment) return null;

		const program = gl.createProgram();
		if (!program) return null;
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

		console.error('aura program:', gl.getProgramInfoLog(program));
		return null;
	}

	/**
	 * The same colour, turned round the wheel and pushed towards the light.
	 *
	 * A hue rotation, which needs a colour space that has a hue: done on the RGB
	 * triple directly it is a shear rather than a rotation, and the two ends come
	 * out muddy instead of opposite. So it goes through HSL, and while it is there
	 * it is given a floor on saturation and lightness, because the ring has to hold
	 * its own against a pale background as well as a dark one and an accent chosen
	 * for text is usually too quiet for that.
	 */
	function turn(rgb: [number, number, number], by: number): [number, number, number] {
		const [r, g, b] = rgb;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		const d = max - min;

		let h = 0;
		if (d > 0) {
			h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			h /= 6;
		}
		const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

		const hue = (h + by + 1) % 1;
		const sat = Math.max(0.62, s);
		const lit = Math.min(0.72, Math.max(0.52, l));

		const c = (1 - Math.abs(2 * lit - 1)) * sat;
		const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
		const m = lit - c / 2;
		const sector = Math.floor(hue * 6) % 6;
		const [rr, gg, bb] = [
			[c, x, 0],
			[x, c, 0],
			[0, c, x],
			[0, x, c],
			[x, 0, c],
			[c, 0, x]
		][sector];
		return [rr + m, gg + m, bb + m];
	}

	/**
	 * The element's own colour, as the shader wants it.
	 *
	 * Read back from the computed style every frame rather than passed in, which
	 * is what lets the caller cross from one hue to another with a CSS transition
	 * and have the drawing follow. `getComputedStyle` resolves whatever was
	 * written, including an `oklch(from …)`, into `rgb()`.
	 */
	function read(element: HTMLElement): [number, number, number] {
		const colour = getComputedStyle(element).color;
		const parts = colour.match(/[\d.]+/g);
		if (!parts || parts.length < 3) return [0.6, 0.7, 1];
		return [Number(parts[0]) / 255, Number(parts[1]) / 255, Number(parts[2]) / 255];
	}
</script>

<canvas bind:this={canvas} class={className} {style}></canvas>
