import { env } from '$env/dynamic/public';

/**
 * Reading a document into something a model can answer from.
 *
 * Everything happens in the browser. A file is never uploaded, not even in
 * server mode: it is parsed where it was picked, turned into Markdown, and only
 * that text travels.
 *
 * Markdown rather than the parser's object tree, which costs five to ten times
 * the tokens, or plain text, which loses the headings and tables a model needs.
 */

/** Where the pdf.js worker is served from. Copied into `static/` by `prepare`. */
const PDF_WORKER_SRC = '/vendor/pdf.worker.min.mjs';

/** Instance-wide off switch. Read at build time like every other `PUBLIC_` flag, so nothing running in the page can talk it out of it. */
export const documentsDisabledByInstance = env.PUBLIC_DISABLE_DOCUMENTS === 'true';

/**
 * Unset, Tesseract fetches the engine and its language data from a public CDN
 * the first time OCR runs, which is unacceptable for an air-gapped install. No
 * user-facing setting: this is a property of the deployment.
 */
const OCR_CORE_PATH = env.PUBLIC_OCR_CORE_PATH || undefined;
const OCR_LANG_PATH = env.PUBLIC_OCR_LANG_PATH || undefined;
const OCR_WORKER_PATH = env.PUBLIC_OCR_WORKER_PATH || undefined;

/** Extensions offered in the file picker, and accepted on drop. */
export const DOCUMENT_EXTENSIONS = [
	'.pdf',
	'.docx',
	'.pptx',
	'.xlsx',
	'.odt',
	'.odp',
	'.ods',
	'.rtf',
	'.epub',
	'.csv',
	'.md',
	'.txt',
	'.html'
] as const;

export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(',');

/** A scanned PDF parses perfectly and yields almost nothing, because there are pictures of characters rather than characters. Catching that lets the app say so. */
const MIN_CHARS_PER_PAGE = 40;

export interface DocumentExtraction {
	/** What gets sent, as Markdown. */
	markdown: string;
	/** Rough token cost, on the same scale the context meter uses. */
	tokens: number;
	pages?: number;
	/** The document's own title, when it has one worth showing. */
	title?: string;
	/** Text came back suspiciously thin for the size of the file: almost certainly a scan. The caller offers the way out rather than pretending it worked. */
	looksScanned: boolean;
	/** Non-fatal problems from the parser, already flattened to strings. */
	warnings: string[];
}

export function isDocumentFile(name: string): boolean {
	const lower = name.toLowerCase();
	return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * The parser, loaded on demand. Two builds, and which one is fetched is the
 * privacy story: the slim build has no OCR engine and no CDN addresses in it.
 * Either way a dynamic import, so an instance with documents off downloads none
 * of it.
 */
async function loadParser(withOcr: boolean) {
	return withOcr ? await import('officeparser') : await import('officeparser/slim');
}

/** Trim the parser's Markdown down to what is worth paying tokens for. */
function tidy(markdown: string): string {
	return (
		markdown
			// An empty YAML block is emitted even when the document has no metadata.
			.replace(/^---\s*\n---\s*\n/, '')
			// Table rules come out padded (`|  ---  |`), which buys nothing.
			.replace(/^\|(\s*-{3,}\s*\|)+\s*$/gm, (row) => row.replace(/\s*---\s*/g, ' --- '))
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

/** Throws on a file that cannot be parsed: silently attaching nothing is how a user ends up arguing with a model about a document it never received. */
export async function extractDocument(
	file: File,
	options: { ocr?: boolean; ocrLanguage?: string; signal?: AbortSignal } = {}
): Promise<DocumentExtraction> {
	const { parseOffice } = await loadParser(!!options.ocr);
	const buffer = new Uint8Array(await file.arrayBuffer());

	const ast = await parseOffice(buffer, {
		pdfWorkerSrc: PDF_WORKER_SRC,
		abortSignal: options.signal ?? null,
		// Notes, comments, headers and footers are part of what a document says;
		// dropping them to save tokens would be editing the user's file for them.
		ocr: !!options.ocr,
		// OCR reads the pictures inside a file, so they have to be pulled out first.
		extractAttachments: !!options.ocr,
		ocrConfig: options.ocr
			? {
					language: options.ocrLanguage?.trim() || 'eng',
					corePath: OCR_CORE_PATH,
					langPath: OCR_LANG_PATH,
					workerPath: OCR_WORKER_PATH
				}
			: undefined
	});

	const { value } = await ast.to('md', {
		// Anchor ids on every heading, and the spans around them, are for a browser
		// rendering a page. A model pays for them and reads past them.
		ignoreInternalLinks: true,
		generateIds: false,
		includeFormatting: false
	});

	const markdown = tidy(value ?? '');
	const pages = ast.metadata?.pages;
	const title = typeof ast.metadata?.title === 'string' ? ast.metadata.title.trim() : '';

	return {
		markdown,
		tokens: Math.ceil(markdown.length / 3.7),
		pages,
		title: title || undefined,
		looksScanned: !!pages && pages > 0 && markdown.length < pages * MIN_CHARS_PER_PAGE,
		warnings: (ast.warnings ?? [])
			.filter((issue) => issue.type !== 'info')
			.map((issue) => issue.message)
	};
}

/**
 * A scanned PDF, as pictures of its pages: the fallback for anyone with a vision
 * model who would rather not host thirty megabytes of OCR engine. They go
 * through the image path that already exists.
 *
 * Capped low: each page becomes a full-size image, and a hundred would blow
 * through any context window and most of the tab's memory.
 */
export const MAX_PAGES_AS_IMAGES = 10;

export async function renderPdfPagesAsImages(
	file: File,
	max = MAX_PAGES_AS_IMAGES
): Promise<{ name: string; dataUrl: string }[]> {
	const pdfjs = await import('pdfjs-dist');
	pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

	const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
	const count = Math.min(pdf.numPages, max);
	const images: { name: string; dataUrl: string }[] = [];

	for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		// 1.6 is the smallest scale where 10pt body text still reads reliably once the
		// image is re-encoded; below that the model starts inventing words.
		const viewport = page.getViewport({ scale: 1.6 });
		const canvas = document.createElement('canvas');
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		const context = canvas.getContext('2d');
		if (!context) break;

		await page.render({ canvas, canvasContext: context, viewport }).promise;
		images.push({
			name: `${file.name} (${pageNumber})`,
			dataUrl: canvas.toDataURL('image/jpeg', 0.82)
		});
		canvas.width = 0;
		canvas.height = 0;
	}

	await pdf.cleanup();
	return images;
}
