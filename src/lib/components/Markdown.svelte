<script lang="ts">
	import hljs from 'highlight.js';
	import katex from 'katex';
	import texmath from 'markdown-it-texmath';
	import MarkdownIt from 'markdown-it/lib/index.mjs';
	import { mount } from 'svelte';

	import 'highlight.js/styles/github.min.css';
	import 'katex/dist/katex.min.css';

	import ButtonCopy from './ButtonCopy.svelte';

	let { markdown, citations }: { markdown: string; citations?: string[] } = $props();
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

	// Turn inline `[n]` references into clickable citation links pointing at the
	// n-th web source. Runs on already-tokenized text, so code spans and fenced
	// blocks (which are separate token types) are never touched.
	md.core.ruler.push('citations', (state) => {
		if (!citations || citations.length === 0) return;
		for (const block of state.tokens) {
			if (block.type !== 'inline' || !block.children) continue;
			const out: typeof block.children = [];
			for (const token of block.children) {
				if (token.type !== 'text' || !/\[\d{1,3}\]/.test(token.content)) {
					out.push(token);
					continue;
				}
				const text = token.content;
				const re = /\[(\d{1,3})\]/g;
				let last = 0;
				let match: RegExpExecArray | null;
				while ((match = re.exec(text))) {
					const url = citations[Number(match[1]) - 1];
					if (!url) continue; // unknown citation number — leave the [n] as plain text
					if (match.index > last) {
						const before = new state.Token('text', '', 0);
						before.content = text.slice(last, match.index);
						out.push(before);
					}
					const open = new state.Token('link_open', 'a', 1);
					open.attrSet('href', url);
					open.attrSet('class', 'citation');
					open.attrSet('target', '_blank');
					open.attrSet('rel', 'noreferrer');
					const label = new state.Token('text', '', 0);
					label.content = match[1];
					out.push(open, label, new state.Token('link_close', 'a', -1));
					last = match.index + match[0].length;
				}
				if (last === 0) {
					out.push(token); // nothing was linkified
				} else if (last < text.length) {
					const after = new state.Token('text', '', 0);
					after.content = text.slice(last);
					out.push(after);
				}
			}
			block.children = out;
		}
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

	/* Inline web-search citation badge, e.g. the small accent "1" after a claim. */
	.markdown :global(a.citation) {
		@apply bg-accent/10 text-accent ml-0.5 inline-flex items-center rounded px-1 align-super text-[0.7em] font-medium no-underline;
		line-height: 1;
	}

	.markdown :global(a.citation:hover) {
		@apply bg-accent/20;
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
