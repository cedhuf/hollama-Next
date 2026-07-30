<script lang="ts">
	import hljs from 'highlight.js';
	import katex from 'katex';
	import texmath from 'markdown-it-texmath';
	import MarkdownIt from 'markdown-it/lib/index.mjs';
	import { mount } from 'svelte';

	import 'katex/dist/katex.min.css';

	import ButtonCopy from './ButtonCopy.svelte';

	let { markdown, citations }: { markdown: string; citations?: string[] } = $props();
	const CODE_SNIPPET_ID = 'code-snippet';

	function normalizeMarkdown(content: string) {
		// Some models cite with <cite id="3, 5">…</cite> instead of [3, 5]; normalise to
		// brackets so the raw tag never leaks and the citation linkifier can handle them.
		content = content.replace(
			/<cite\b[^>]*?\bid=["']?([\d\s,]+?)["']?[^>]*>.*?<\/cite>/gis,
			'[$1]'
		);

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
		// Models emit bare URLs constantly; without this they render as dead text.
		linkify: true,
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

	// Only turn explicit http(s) URLs into links. Fuzzy matching would linkify any
	// `word.tld`, and plenty of prose about `main.py` or `config.sh` would become
	// links to Paraguay.
	md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });

	// Indented code blocks off: in Markdown four leading spaces mean "code", and
	// models indent constantly — nested bullets, sub-points, reasoning outlines.
	// Prose was landing in a code block, which by design never wraps, so a
	// paragraph became as wide as its longest line and had to be scrolled
	// sideways to read. Fenced blocks (```) are unaffected, and they are how a
	// model actually marks up code.
	md.disable('code');

	/**
	 * A readable stand-in for a URL that is its own link text.
	 *
	 * A raw URL is often longer than a phone's column, so it wrapped across two or
	 * three lines and buried the sentence around it. The host plus the last path
	 * segment is what actually identifies a page; the rest is noise the `title`
	 * (and the link itself) still carries.
	 */
	function shortenUrl(url: string, max = 44): string {
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.replace(/^www\./, '');
			const path = parsed.pathname === '/' ? '' : parsed.pathname;
			const plain = host + path + parsed.search;
			if (plain.length <= max) return plain;

			const tail = path.split('/').filter(Boolean).pop() ?? '';
			const elided = tail ? `${host}/…/${tail}` : `${host}/…`;
			return elided.length <= max ? elided : `${elided.slice(0, max - 1)}…`;
		} catch {
			return url.length > max ? `${url.slice(0, max - 1)}…` : url;
		}
	}

	// Shorten the visible text of links that are just their own URL. Links with
	// authored text are left alone — the author chose those words.
	md.core.ruler.push('shorten-urls', (state) => {
		for (const block of state.tokens) {
			if (block.type !== 'inline' || !block.children) continue;
			const children = block.children;
			for (let i = 0; i < children.length; i++) {
				if (children[i].type !== 'link_open') continue;
				const href = children[i].attrGet('href');
				const label = children[i + 1];
				if (!href || label?.type !== 'text' || children[i + 2]?.type !== 'link_close') continue;
				if (label.content !== href) continue;
				children[i].attrSet('title', href);
				label.content = shortenUrl(href);
			}
		}
	});

	// Math notation parsing with Katex, with multiple delimiters
	md.use(texmath, {
		engine: katex,
		delimiters: ['dollars', 'brackets', 'doxygen', 'gitlab', 'julia', 'kramdown', 'beg_end']
	});

	// Turn inline `[n]` (and `[n, m]` lists) into clickable citation links pointing at
	// the n-th web source. Runs on already-tokenized text, so code spans and fenced
	// blocks (which are separate token types) are never touched.
	const CITE = /\[\s*\d{1,3}(?:\s*,\s*\d{1,3})*\s*\]/; // guard (non-global)
	md.core.ruler.push('citations', (state) => {
		if (!citations || citations.length === 0) return;
		for (const block of state.tokens) {
			if (block.type !== 'inline' || !block.children) continue;
			const out: typeof block.children = [];
			for (const token of block.children) {
				if (token.type !== 'text' || !CITE.test(token.content)) {
					out.push(token);
					continue;
				}
				const text = token.content;
				const re = /\[\s*(\d{1,3}(?:\s*,\s*\d{1,3})*)\s*\]/g;
				let last = 0;
				let linkified = false;
				let match: RegExpExecArray | null;
				while ((match = re.exec(text))) {
					// Resolve each number in the bracket; skip ones we have no source for.
					const nums = match[1].split(',').map((n) => Number(n.trim()));
					const resolved = nums.filter((n) => citations[n - 1]);
					if (resolved.length === 0) continue; // leave the whole [..] as plain text
					if (match.index > last) {
						const before = new state.Token('text', '', 0);
						before.content = text.slice(last, match.index);
						out.push(before);
					}
					for (const n of resolved) {
						const open = new state.Token('link_open', 'a', 1);
						open.attrSet('href', citations[n - 1]);
						open.attrSet('class', 'citation');
						open.attrSet('target', '_blank');
						open.attrSet('rel', 'noreferrer');
						const label = new state.Token('text', '', 0);
						label.content = String(n);
						out.push(open, label, new state.Token('link_close', 'a', -1));
					}
					last = match.index + match[0].length;
					linkified = true;
				}
				if (!linkified) {
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

	/* As a flex child (of the message bubble), allow shrinking below content width
	   so a long code line / table / URL scrolls or wraps instead of widening — and
	   ultimately horizontally scrolling — the whole chat panel on mobile. */
	.markdown {
		min-width: 0;
		max-width: 100%;
	}

	.markdown :global(> *:first-child) {
		@apply mt-0;
	}

	.markdown :global(> *:last-child) {
		@apply mb-0;
	}

	/* Headings: a restrained, monotonic scale tuned for chat answers (close to
	   ChatGPT/Claude) — strong colour, tight tracking, more space above than below
	   so a heading hugs the text it introduces. No width cap (it forced odd wraps). */
	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4),
	.markdown :global(h5),
	.markdown :global(h6) {
		@apply text-active tracking-tight;
	}

	.markdown :global(h1) {
		@apply mt-6 mb-3 text-xl font-bold md:text-2xl;
	}

	.markdown :global(h2) {
		@apply mt-6 mb-2 text-lg font-semibold md:text-xl;
	}

	.markdown :global(h3) {
		@apply mt-5 mb-2 text-base font-semibold md:text-lg;
	}

	.markdown :global(h4) {
		@apply mt-4 mb-1 text-base font-semibold;
	}

	.markdown :global(h5) {
		@apply mt-4 mb-1 text-sm font-semibold;
	}

	.markdown :global(h6) {
		@apply text-muted mt-4 mb-1 text-sm font-semibold;
	}

	.markdown :global(p) {
		@apply my-3 leading-relaxed;
	}

	.markdown :global(p),
	.markdown :global(li) {
		@apply max-w-prose text-sm;
		@apply md:text-base;
		/* Break long unbreakable strings (URLs, hashes) instead of overflowing. */
		overflow-wrap: break-word;
	}

	/* Reasoning is an aside, not the answer, and has to read as one at a glance.
	   The rules above set an absolute size, so the container's `text-xs` was
	   overridden and the two ended up identical in size and weight — the left rule
	   alone wasn't carrying the hierarchy. Stepped down a size and desaturated
	   here, where the specificity is enough to win. */
	:global(.article--reasoning) .markdown :global(p),
	:global(.article--reasoning) .markdown :global(li),
	:global(.article--reasoning) .markdown :global(strong) {
		@apply text-xs;
		@apply md:text-sm;
		color: hsl(var(--hsl-text-shade-2));
	}

	:global(.article--reasoning) .markdown :global(strong) {
		@apply font-medium;
	}

	:global(.article--reasoning) .markdown :global(h1),
	:global(.article--reasoning) .markdown :global(h2),
	:global(.article--reasoning) .markdown :global(h3),
	:global(.article--reasoning) .markdown :global(h4) {
		@apply text-muted mt-3 mb-0.5 text-xs font-medium;
	}

	/* Lists: indent with left padding (so markers sit in the gutter and nested
	   lists step in cleanly) rather than symmetric margins. */
	.markdown :global(ul),
	.markdown :global(ol) {
		@apply my-3 list-outside pl-6;
	}

	.markdown :global(ol) {
		@apply list-decimal;
	}

	.markdown :global(ul) {
		@apply list-disc;
	}

	.markdown :global(li) {
		@apply my-1;
	}

	/* Tight nested lists, and no double spacing for loose (paragraph-wrapped) items. */
	.markdown :global(li > ul),
	.markdown :global(li > ol) {
		@apply my-1;
	}

	.markdown :global(li > p) {
		@apply my-0;
	}

	.markdown :global(li > p + p) {
		@apply mt-2;
	}

	.markdown :global(hr) {
		@apply border-shade-3 my-6;
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
		/* Belt and braces for the links we don't shorten (authored text, or a URL
		   still long after eliding): break inside rather than push the bubble wide. */
		overflow-wrap: anywhere;
	}

	/* Inline web-search citation badge, e.g. the small accent "1" after a claim. */
	.markdown :global(a.citation) {
		@apply bg-accent/10 text-accent ml-0.5 inline-flex items-center rounded px-1 align-super text-[0.7em] font-medium no-underline;
		line-height: 1;
	}

	.markdown :global(a.citation:hover) {
		@apply bg-accent/20;
	}

	/* Wide tables scroll inside their own block instead of stretching the bubble and
	   pushing the whole chat panel into a horizontal scroll (GitHub/ChatGPT pattern).
	   `display: block` + `width: max-content` lets the table size to its content, while
	   `max-width: 100%` caps it to the bubble and turns on the internal scrollbar. */
	.markdown :global(table) {
		@apply overflow-scrollbar my-4 border-separate border-spacing-0 rounded-md text-sm;
		display: block;
		width: max-content;
		max-width: 100%;
	}

	/* Long display-math equations scroll inside their own block instead of
	   overflowing the bubble (same rationale as wide code/tables). */
	.markdown :global(.katex-display) {
		@apply overflow-scrollbar;
		max-width: 100%;
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
		@apply overflow-scrollbar border-shade-2 relative my-4 rounded-md border;
		@apply first:mt-0;
		max-width: 100%;
	}

	.markdown :global(code) {
		@apply bg-shade-2 text-accent rounded-md p-1 text-xs;
		@apply md:text-sm;
		font-variant-ligatures: none;
		/* Inline code: break long tokens (paths, hashes) rather than overflow. */
		overflow-wrap: anywhere;
	}

	/* Code block: readable default colour (highlight.js token spans override per
	   token, set in app.pcss); keep lines intact so they scroll, never wrap. */
	.markdown :global(pre code) {
		@apply bg-shade-0/50 block p-4 pr-12 text-xs;
		@apply md:text-sm;
		color: hsl(var(--hsl-text-shade-1));
		overflow-wrap: normal;
		word-break: normal;
	}

	.markdown :global(a:has(code)) {
		@apply decoration-accent;
	}

	.markdown :global(a > code) {
		@apply hover:bg-shade-0;
	}

	.markdown :global(pre > .copy-button) {
		@apply bg-shade-1 absolute top-2 right-2 rounded-md;
	}

	/* Fading it out until hover only makes sense where hovering exists. On touch it
	   stays put — otherwise a code block or shell command can never be copied. */
	@media (hover: hover) {
		.markdown :global(pre > .copy-button) {
			@apply opacity-0 transition-opacity;
		}

		.markdown :global(pre:hover > .copy-button),
		.markdown :global(pre:focus-within > .copy-button) {
			@apply opacity-100;
		}
	}
</style>
