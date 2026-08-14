<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="static/logo-mark-dark.png" />
  <img src="static/logo-mark.png" alt="Llooma" width="96" />
</picture>

# Llooma /ˈluː.mə/

**A (less) minimal LLM chat app that runs _entirely_ in your browser.**

[Documentation](https://llooma.eu) · [Roadmap](https://llooma.eu/roadmap/) · [Changes from Hollama](https://llooma.eu/changes-from-hollama/)

This is a fork of [Hollama](https://github.com/fmaclen/hollama) by [fmaclen](https://github.com/fmaclen).

</div>

![The sidebar, a conversation, the Library, and the Interface and Servers settings](static/screenshots/sections.png)

> [!WARNING]
> This project is an **early preview**. Not made for production use. Expect breaking changes, unfinished features, and rough edges.
>
> I'm not a professional developer and I'm still learning. I've made use of AI assistance while trying to remain responsible. Any audit, suggestion or PR is more than welcome. If AI is not your thing, you can check the original project instead or other forks, no hard feelings, just being transparent.

## What it is

Bring your own models, from Ollama, OpenAI, Claude, Infomaniak or anything OpenAI-compatible, and
chat with them from an app that is yours.

- **Two ways to run it.** _Local_ keeps everything in your browser with your own keys. _Server_
  signs users in, stores their data per account, and keeps the API keys where a browser can never
  read them.
- **Personas.** Give a model a face, a voice and a name. A coach, a tutor, a companion, each with
  its own avatar, prompt, model, greeting and knowledge. Import existing ones, including OpenWebUI
  exports, and share them across a team.
- **Knowledge and documents.** Write down what you keep re-explaining and attach it anywhere. Drop
  in a PDF, a spreadsheet or a Word file and it is read _in your browser_, never uploaded, even in
  server mode.
- **Tools that stay yours.** Web search, page reading, interactive choices. Every instruction behind
  them is a text box you can rewrite.
- **Compaction.** When a conversation gets too long, `/compact` replaces what was said with a
  structured summary so it keeps fitting. Nothing is deleted, and one click puts it all back.
- **Full-text search** across every conversation, answering with the passage itself.
- **Six themes**, each with a light and a dark ramp, English and French, installable as a PWA.

The [documentation](https://llooma.eu/features/) covers each of these properly.

## Get started

```shell
docker run --rm -d -p 4173:4173 --name llooma ghcr.io/cedhuf/llooma:latest
```

Then open <http://localhost:4173>. That is local mode, with nothing stored outside your browser.

For a real deployment, Docker Compose, server mode, every environment variable, and the security
notes that matter before exposing an instance:

- [Installation](https://llooma.eu/guides/installation/)
- [Running modes](https://llooma.eu/guides/running-modes/)
- [First run](https://llooma.eu/guides/first-run/)
- [Configuration](https://llooma.eu/reference/configuration/)
- [Security](https://llooma.eu/guides/security/)

## Contributing

> [!IMPORTANT]
> Feel free to participate, there is no bad contribution. One rule to keep the project manageable: **issues are for bugs only**. For a feature request or anything else, please open a discussion. If the community backs it, and we agree on the technical approach, it will become an issue. Thanks!

See [CONTRIBUTING.md](CONTRIBUTING.md), and
[Working on Llooma](https://llooma.eu/development/) for how the codebase is laid out.

## Screenshots

![Themes](static/screenshots/themes.png)

_The six themes, left to right: Classic, Dracula, Catppuccin, Gruvbox, Nord and Solarized,
alternating light and dark ramps._

| ![Home](static/screenshots/home.png)                   | ![A conversation](static/screenshots/session.png)     | ![Library](static/screenshots/library.png)        |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| ![Interface settings](static/screenshots/settings.png) | ![Server connections](static/screenshots/servers.png) | ![Dark mode](static/screenshots/session-dark.png) |

## License

[MIT](LICENSE)

Document reading is powered by [officeparser](https://github.com/harshankur/officeParser) (MIT) and
[pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0).
