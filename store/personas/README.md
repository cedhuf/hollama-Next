# The persona store

The personas Llooma offers to install. Nothing here ships inside the application:
the app fetches this folder over the network, which is why adding a persona is a
file in a pull request rather than a release.

Served from the documentation site, so the public address of this folder is
<https://llooma.eu/store/personas/>. The docs workflow copies it into the site before
building.

## Layout

```
personas/
  index.json        generated, do not edit by hand
  bundles/<id>.json one persona each
```

The app reads `index.json` to fill its browser and only fetches a bundle when
someone installs that persona. Keep the index light: a listing is meant to be
cheap even with a thousand entries in it.

Personas are written in English, whatever language they end up being used in.
The store is read by everyone, and a listing that is half in one language and
half in another is one nobody can browse. A persona answers in whatever language
it is spoken to.

## Adding a persona

Write `bundles/<id>.json`, then:

```bash
pnpm personas:index
```

The file name and the `id` inside have to match. `pnpm personas:check` verifies
the committed index still describes the bundles, and runs in CI.

The index carries two digests per persona, both computed for you: a `sha256` of the bundle's bytes,
checked when someone installs it, and a fingerprint of what the persona says, which is how the app
knows whether an installed copy has been edited or a new version has been published. Neither goes in
the bundle, and neither is yours to write.

## The bundle format

```jsonc
{
	"format": "llooma.persona",
	"version": 1,
	"id": "maite", // stable across revisions; this is what identifies it
	"revision": 1, // bump whenever you change anything below
	"locale": "en", // what the persona speaks
	"author": "Llooma",
	"license": "CC0-1.0",
	"persona": {
		"name": "Maïté",
		"tagline": "One line, shown under the name",
		"avatar": { "kind": "glyph", "id": "pot", "color": "#BA7517" },
		"greeting": "The first message, before anyone has typed anything",
		"systemPrompt": "The soul of it",
		"webSearch": true, // optional: the conversation starts with search on
		"suggestions": ["Shown as starting points"],
		"tags": ["cooking", "recipes"]
	},
	"knowledge": [{ "name": "A document", "content": "Its text" }]
}
```

No model is named, on purpose. There are hundreds of them across nearly as many
providers, all naming them differently and all revising them constantly, so a
model written into a bundle is wrong for almost everyone reading it. Installing
uses the reader's own default, and they can change it afterwards.

### Avatars

Three kinds. Prefer a glyph: it costs thirty bytes, stays sharp at any size, and
is drawn with the app's own ink so it follows the theme.

| kind       | fields                    |
| ---------- | ------------------------- |
| `glyph`    | `id`, `color`             |
| `image`    | `src` (data URI), `color` |
| `initials` | `color`                   |

The glyph ids are the ones in `src/lib/personaGlyphs.ts`. An id that is not in
that list falls back to initials rather than failing, so a bundle written against
a newer app still installs.

An image avatar over 4 KB is listed as initials in the index and appears in full
once installed. That is not a limit on the picture, only on what the listing
carries.

## Moving elsewhere

The app knows one address, and every path inside `index.json` is relative to it.
Moving this folder to a repository of its own is therefore a copy and one
changed URL, with nothing to migrate on anyone's machine.
