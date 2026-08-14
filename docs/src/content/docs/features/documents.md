---
title: Documents
description: Attach a PDF, a Word file or a spreadsheet and talk to the model about it.
sidebar:
  order: 3
---

Attach a file from the composer's _Add context_ menu and its text joins the conversation. PDF,
DOCX, PPTX, XLSX, ODT, ODP, ODS, RTF, EPUB, CSV, HTML, Markdown and plain text.

## Nothing is uploaded

The file is read **in your browser**. Not on the server, not by a provider, not by a third-party
service. This holds in server mode too: the file never leaves the machine it was picked on. What
travels is the text that came out of it, inside the message you choose to send, to the provider
you already chose.

Which also means the feature works the same on a laptop with no server behind it as on a
self-hosted instance, and works offline.

## What happens, step by step

1. You pick a file. Nothing is sent anywhere.
2. A pill appears with the file's name and a spinner. Large PDFs take a few seconds.
3. The file is parsed in the browser and turned into Markdown, so headings, lists and tables
   survive rather than collapsing into a wall of text.
4. The pill fills in with the name and the page count.
5. When you send your message, the extracted text goes out as a context block ahead of it, the
   same envelope [knowledge](/features/) uses.
6. The conversation shows the pill, not the text. A hundred pages of Markdown unrolled in the
   thread would bury the conversation. The text is still in the message: still searchable, still
   exported, still counted by the load meter.

Files are read one at a time even when you attach several. Parsing a PDF is the heaviest thing
the tab will do, and three at once is how a phone kills a page.

## What does the reading

The parser is [**officeparser**](https://github.com/harshankur/officeParser) by
[Harsh Ankur](https://github.com/harshankur), MIT licensed. It handles the whole list of formats
above and emits Markdown directly, which is the reason headings and tables survive the trip into the
conversation. Llooma bundles it and calls it in the browser; the project deserves the credit for
everything on this page working at all.

Two builds of it exist, and which one is fetched is the whole privacy story:

- **slim**, used by default. No OCR engine, and no remote addresses in it at all.
- **full**, fetched only when you turn OCR on. This is the build that carries Tesseract.

PDFs additionally go through [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) for page
rendering, whose worker is served from your own origin. Both are loaded on demand, so an instance
with documents switched off downloads neither.

## When a PDF has no text in it

A scanned document contains pictures of words, not words. It parses perfectly and yields nothing.

Rather than attach an empty document, Llooma says so and offers two ways forward.

### The vision fallback

Offered on the spot, as an action on the warning: **send the pages as images**. The pages are
rendered and attached as images, and a vision model reads them directly.

- capped at **10 pages**, because each page is a full-size image and a hundred of them would
  exhaust both the context window and the tab's memory
- it needs a vision model on the conversation, and costs far more context than text would
- it needs nothing installed, downloaded or configured

This is offered, never automatic: it is a different and more expensive way to answer the same
question, and that is a choice worth leaving to you.

### OCR

The other way is to read the text out of the images. See below.

## OCR

Off by default, under _Settings → Tools → Documents_. Three things to know before turning it on,
and they are the reason it is off:

**It is slow.** A few seconds per page. A long scan is a long wait.

**It is approximate.** Tables and multi-column layouts come out flattened. Treat the result as a
readable transcript, not as a faithful copy.

**It downloads an engine.** On first use, the OCR engine and the language data for your chosen
languages are fetched. Unless the instance hosts them itself (see below), they come from a public
CDN. That is a request to a third party, from a feature that otherwise makes none, which is
exactly why this is a switch you throw rather than a default you discover.

With OCR off, none of that code is ever downloaded: the reader Llooma loads is a build with no
OCR engine and no remote addresses in it at all.

Set the languages with Tesseract codes: `eng`, `fra`, `deu`. Combine with a plus sign, `eng+fra`.
Each language is a separate download.

## Hosting the OCR engine yourself

For an instance with no internet access, or one that refuses third-party requests on principle,
serve the files and point Llooma at them:

```shell
PUBLIC_OCR_CORE_PATH=/vendor/tesseract-core
PUBLIC_OCR_LANG_PATH=/vendor/tesseract-lang
PUBLIC_OCR_WORKER_PATH=/vendor/tesseract/worker.min.js
```

Take the files from `tesseract.js-core` (all four WebAssembly variants: which one loads depends on
the visitor's processor) and from the `@tesseract.js-data` language packages. Budget roughly 30 MB
for the engine and 3 to 11 MB per language, depending on whether you take the fast or the standard
training data.

The pdf.js worker needs no configuration: it is copied into the app's own `static/` folder at
install time and served from your origin, so reading a PDF never reaches out either.

## Turning it off

**As a user:** _Settings → Tools → Documents_. The reader is loaded on demand, so switching it off
means it is never downloaded at all, not merely unused. The _Document_ entry disappears from the
menu. Images are unaffected: they do not go through this.

**As an instance:** set `PUBLIC_DISABLE_DOCUMENTS=true`. The section disappears from settings
entirely and no user can turn it back on.

## What this is not

It reads a document into the conversation. It does not index a library, and there is no retrieval
step: the whole document goes into the context, and a document too large for the model's window is
too large, full stop. The [load meter](/features/compaction/) shows what you are about to
spend before you send, and [compaction](/features/compaction/) buys room back once the
conversation runs long.

One consequence worth stating plainly, because it surprises people: attaching a spreadsheet gives
the model the numbers as text. It does not give it a calculator. Ask a model to total ten thousand
rows and it will produce a number that looks right. Verify anything that matters.

## Why there is no retrieval

Most chat apps in this space answer documents with a full retrieval pipeline: chunking, an
embedding model, a vector database, and the settings that come with them. Chunk size, overlap,
top-k, similarity threshold. Llooma does none of that, on purpose.

For the common case, reading a contract, summarising a report, comparing two files, retrieval is
the wrong tool. It hands the model fragments it guessed were relevant and hides the rest. Putting
the whole document in the context gives better answers, needs no configuration, and cannot silently
drop the paragraph that mattered. It is telling that apps built around retrieval have all ended up
adding a "send the whole document" mode.

Retrieval earns its keep on a corpus, not on a document: hundreds of files, asked a question
without knowing which file holds the answer. That is a different feature, and Llooma does not
pretend to offer it today.

If enough people want it, the shape it would take is deliberately modest. Keyword search over the
attached documents, ranked, no embedding model to pick and no vector store to run, which means it
keeps working offline and needs no setup. The parser already emits chunks with their headings, so
the groundwork exists. Vector search would only follow if that proved genuinely insufficient.

Until then, the honest boundary is the one above: a document too large for the model's window is
too large. The [load meter](/features/compaction/) shows the cost before you send, and
[compaction](/features/compaction/) buys room back as the conversation runs long. If you
have a use case this does not cover, open a discussion: that is exactly the demand worth measuring
before building anything heavier.
