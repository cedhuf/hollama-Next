# Contributing

There is no bad contribution. One rule keeps the project manageable:

**Issues are for bugs.** Feature requests and everything else start as a
[discussion](https://github.com/cedhuf/llooma/discussions). If the community backs it and the
approach holds up, it becomes an issue.

## Found a bug

1. Search the [existing issues](https://github.com/cedhuf/llooma/issues).
2. Open a [new one](https://github.com/cedhuf/llooma/issues/new) if it is not there.

Commenting on or upvoting an existing issue helps: active ones get prioritised.

## Want to write code

Please discuss it in an issue first, then open a
[pull request](https://github.com/cedhuf/llooma/pulls).

```shell
pnpm install
pnpm run dev
```

Requires Node 26 and pnpm.

Everything else lives in the documentation, which is the copy kept up to date:

- **[Working on Llooma](https://cedhuf.github.io/llooma/development/)** for the layout of the
  codebase, the one seam that matters, and the checks to run before pushing.
- **[Translations](https://cedhuf.github.io/llooma/development/translations/)** for adding or
  completing a language.
- **[Releases](https://cedhuf.github.io/llooma/development/releases/)** for what commit messages
  have to look like, since they are what produces the version and the changelog.
- **[Roadmap](https://cedhuf.github.io/llooma/roadmap/)** for what is planned and what is known to
  be broken. The end-to-end test suite in particular would be a genuinely valuable thing to fix.

The documentation lives in `docs/` in this repository, so a change to the app and the change to its
documentation can land in the same commit.
