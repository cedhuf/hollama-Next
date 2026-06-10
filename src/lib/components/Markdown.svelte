<script lang="ts">
	import hljs from 'highlight.js';
	import katex from 'katex';
	import texmath from 'markdown-it-texmath';
	import MarkdownIt from 'markdown-it/lib/index.mjs';
	import { mount } from 'svelte';

	import 'highlight.js/styles/github.min.css';
	import 'katex/dist/katex.min.css';

	import ButtonCopy from './ButtonCopy.svelte';

	let { markdown }: { markdown: string } = $props();
	const CODE_SNIPPET_ID = 'code-snippet';

	function normalizeMarkdown(content: string) {
		// Replace multiple newlines with double newlines
		content = content.replace(/\n{2,}/g, '\n\n');

		// First, normalize display math blocks
		content = content.replace(/\n\\\[/g, '\n\n\\[');
		content = content.replace(/\\]\n/g, '\\]\n\n');

		// Split on all math delimiters: \[...\], \(...\), and $...$
		// Using [\s\S] instead of . to match across lines
		const parts = content.split(/(\$[^$]+\$|\\[([^)]+\\]|\\[\s\S]+?\\])/g);
		content = parts
			.map((part) => {
				// If this part is any kind of math block, leave it unchanged
				if (part.startsWith('$') || part.startsWith('\\[') || part.startsWith('\\(')) {
					return part;
				}
				// Otherwise, wrap any \boxed commands in inline math
				return part.replace(/\\boxed\{((?:[^{}]|\{[^{}]*\})*)\}/g, '\\(\\boxed{$1}\\)');
			})
			.join('');

		return content;
	}

	function renderCodeSnippet(code: string) {
		return `<pre id="${CODE_SNIPPET_ID}"><code class="hljs">${code}</code></pre>`;
	}

	const md: MarkdownIt = new MarkdownIt({
		highlight: function (str, lang) {
			if (lang && hljs.getLanguage(lang)) {
				try {
					return renderCodeSnippet(
						hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
					);
				} catch (error) {
					console.error('Error in renderCodeSnippet:', error);
				}
			}

			return renderCodeSnippet(md.utils.escapeHtml(str));
		}
	});

	// Math notation parsing with Katex, with multiple delimiters
	md.use(texmath, {
		engine: katex,
		delimiters: ['dollars', 'brackets', 'doxygen', 'gitlab', 'julia', 'kramdown', 'beg_end']
	});

	$effect(() => {
		const preElements = document.querySelectorAll(`pre#${CODE_SNIPPET_ID}`);

		preElements.forEach((preElement) => {
			const codeElement = preElement.querySelector('code');
			if (codeElement)
				mount(ButtonCopy, { target: preElement, props: { content: codeElement.innerText } });
		});
	});
</script>

<div class="markdown">
	<!--
		HACK: `{#if markdown}` is needed to prevent the `eslint-disable` comment from
		getting formatted on auto-formatting.
	-->
	{#if markdown}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html md.render(normalizeMarkdown(markdown))}
	{/if}
</div>

<style lang="postcss">
	@reference "../../app.pcss";

	.markdown :global(> *:first-child) {
		@apply mt-0;
	}

	.markdown :global(> *:last-child) {
		@apply mb-0;
	}

	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4),
	.markdown :global(h5),
	.markdown :global(h6) {
		@apply max-w-[35ch] tracking-tight;
	}

	.markdown :global(h1) {
		@apply my-10 max-w-[22ch] text-3xl font-bold md:text-4xl;
	}

	.markdown :global(h2) {
		@apply mt-8 text-xl font-semibold md:text-2xl;
	}

	.markdown :global(h3) {
		@apply my-2 text-2xl font-light;
	}

	.markdown :global(h4) {
		@apply mt-8 text-lg font-semibold md:text-xl;
	}

	.markdown :global(h5),
	.markdown :global(h6) {
		@apply mt-8 font-semibold;
	}

	.markdown :global(p) {
		@apply my-3;
	}

	.markdown :global(p),
	.markdown :global(li) {
		@apply max-w-prose text-sm;
		@apply md:text-base;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		@apply mx-7 my-2 flex list-outside flex-col gap-y-1;
	}

	.markdown :global(ol) {
		@apply list-decimal;
	}

	.markdown :global(ul) {
		@apply list-disc;
	}

	.markdown :global(li) {
		@apply my-0.5;
	}

	.markdown :global(blockquote) {
		@apply border-l-shade-3 text-muted my-3 border-l-4 pl-4 italic;
	}

	.markdown :global(blockquote > p) {
		@apply text-inherit;
	}

	.markdown :global(strong) {
		@apply font-semibold;
	}

	.markdown :global(a) {
		@apply text-link;
	}

	.markdown :global(table) {
		@apply w-full border-separate border-spacing-0 rounded-md;
	}

	.markdown :global(th),
	.markdown :global(td) {
		@apply border-shade-3 border-b border-l px-3 py-1 text-left text-sm;
	}

	.markdown :global(th) {
		@apply border-t;
	}

	.markdown :global(th:first-child) {
		@apply rounded-tl-md;
	}

	.markdown :global(th:last-child) {
		@apply rounded-tr-md border-r;
	}

	.markdown :global(td:last-child) {
		@apply border-r;
	}

	.markdown :global(tbody tr:last-child td:first-child) {
		@apply rounded-bl-md;
	}

	.markdown :global(tbody tr:last-child td:last-child) {
		@apply rounded-br-md;
	}

	.markdown :global(th) {
		@apply bg-shade-2;
	}

	/* Code */

	.markdown :global(pre) {
		@apply overflow-scrollbar border-shade-2 relative my-6 rounded-md border;
		@apply first:mt-0;
	}

	.markdown :global(code) {
		@apply bg-shade-2 text-accent rounded-md p-1 text-xs;
		@apply md:text-sm;
		font-variant-ligatures: none;
	}

	.markdown :global(pre code) {
		@apply bg-shade-0/50 block p-4 pr-12 text-base text-xs;
		@apply md:text-sm;
	}

	.markdown :global(pre code:where([data-color-theme='dark'], [data-color-theme='dark'] *)) {
		@apply bg-shade-0/50 text-muted;
	}

	.markdown :global(a:has(code)) {
		@apply decoration-accent;
	}

	.markdown :global(a > code) {
		@apply hover:bg-shade-0;
	}

	.markdown :global(pre > .copy-button) {
		@apply bg-shade-1 absolute top-2 right-2 rounded-md opacity-0;
	}

	.markdown :global(pre:hover > .copy-button) {
		@apply opacity-100;
	}
</style>
