# The playbook store

The playbooks Llooma offers to install. Nothing here ships inside the
application: the app fetches this folder over the network, which is why adding a
playbook is a file in a pull request rather than a release.

Served from the documentation site, so the public address of this folder is
<https://llooma.eu/playbooks/>. The docs workflow copies it into the site before
building.

## Layout

```
playbooks/
  index.json        generated, do not edit by hand
  bundles/<id>.json one playbook each
```

The app reads `index.json` to fill its browser and only fetches a bundle when
someone installs that playbook. The procedure itself is deliberately absent from
the listing: it is the bulk of a playbook and only whoever installs one needs it.

## Adding one

Write `bundles/<id>.json`, where `<id>` matches the file name, then run:

```
pnpm playbooks:index
```

CI runs `pnpm playbooks:check` and fails if the committed index no longer
describes the bundles.

```json
{
	"format": "llooma.playbook",
	"version": 1,
	"id": "weekly-meals",
	"revision": 1,
	"locale": "en",
	"author": "Llooma",
	"license": "CC0-1.0",
	"playbook": {
		"name": "Meals for the week",
		"summary": "One line, written for the moment somebody is choosing.",
		"color": "#1D9E75",
		"glyph": "face-chef",
		"tags": ["cooking", "weekly"],
		"instructions": "## Steps\n\n…"
	}
}
```

`revision` goes up whenever the playbook changes, which is what offers the new
version to people who already installed it. An untouched copy is offered the
update; one somebody has edited is left alone and told the store has moved on.

## What makes a good one

A playbook is a procedure a model follows, not a personality and not a prompt
you would have typed anyway. The ones worth writing:

- **Ask before assuming.** Say what to establish first, in one message rather
  than an interrogation, and say when to start without waiting.
- **Say what the answer looks like.** A table, a list, a draft reply. "Be
  helpful" is not a procedure.
- **Say what not to do.** The failure mode is usually specific: eight things to
  try at once, a balanced list instead of a recommendation, an invented legal
  consequence.
- **Stay model-agnostic.** Plain Markdown instructions, no tool names, no
  provider assumptions.
