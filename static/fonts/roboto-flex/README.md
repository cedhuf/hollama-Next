# Roboto Flex, two axes, latin

One file, sixteen kilobytes, and it exists for a single line of text: the status
line inside the orb on the voice screen.

## Why this font and not Inter

Inter ships here as static cuts and has no height axis even as a variable font.
Roboto Flex carries Amstelvar's parametric axes, two of which are what that line
needs:

- `YTLC`, the height of the lowercase, 416 to 570, default 500.
- `YTAS`, the height of the ascenders, 649 to 854, default 750.

Both are designed to move without changing advance widths, which is the whole
reason they are usable for an animation: a line whose letters changed width would
recompose on every frame and jitter sideways. `wght` does change widths and is
deliberately not in this file.

## How it was made

Google Fonts instances the variable font down to whatever axes are asked for, so
there is no build step and no `fonttools` to keep working:

```
curl -H 'User-Agent: <a modern desktop browser>' \
  'https://fonts.googleapis.com/css2?family=Roboto+Flex:YTAS,YTLC@649..854,416..570'
```

That answers with one `@font-face` per script. This is the `latin` one, which
covers U+0000-00FF and therefore English and French. Adding a language that needs
`latin-ext` means fetching that block from the same answer.

Apache License 2.0, like the rest of the Roboto family.
