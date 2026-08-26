# Roboto Flex, two axes, latin

One file, sixteen kilobytes, and it exists for a single line of text: the status
line inside the orb on the voice screen.

## Why this font and not Inter

Inter ships here as static cuts and has no height axis even as a variable font.
Roboto Flex carries Amstelvar's parametric axes, and six of them are in this cut:

| Axis   | What it moves           | Kept range   |
| ------ | ----------------------- | ------------ |
| `YTLC` | height of the lowercase | 416 to 570   |
| `YTAS` | height of the ascenders | 649 to 854   |
| `YTUC` | height of the capitals  | 660 to 760   |
| `YTDE` | depth of the descenders | -260 to -140 |
| `GRAD` | weight of the strokes   | -80 to 100   |
| `slnt` | slant, in degrees       | -4 to 0      |

Every one of them leaves advance widths alone, which is the whole reason they are
usable for an animation: a line whose letters changed width would recompose on
every frame and jitter sideways. `GRAD` exists precisely for that, a grade axis
being a weight change with the metrics held. `slnt` is a shear, which does not
change advance either.

`wght` and `wdth` are the obvious axes and both are deliberately absent. They are
the two that move widths.

## How it was made

Google Fonts instances the variable font down to whatever axes are asked for, so
there is no build step and no `fonttools` to keep working:

Note the ordering the API insists on: registered axes first in lowercase
alphabetical order, then the custom ones in uppercase alphabetical order.

```
curl -H 'User-Agent: <a modern desktop browser>' \
  'https://fonts.googleapis.com/css2?family=Roboto+Flex:slnt,GRAD,YTAS,YTDE,YTLC,YTUC@-4..0,-80..100,649..854,-260..-140,416..570,660..760'
```

Six axes rather than two costs about seventeen kilobytes: 16 KB against 33 KB.

That answers with one `@font-face` per script. This is the `latin` one, which
covers U+0000-00FF and therefore English and French. Adding a language that needs
`latin-ext` means fetching that block from the same answer.

Apache License 2.0, like the rest of the Roboto family.
