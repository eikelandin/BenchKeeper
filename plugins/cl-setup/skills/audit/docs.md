# Lens: docs

For READMEs, `docs/`, guides, release notes templates, pull request and issue templates.

## Patterns

| Pattern | The text | Action |
| --- | --- | --- |
| wrong | A statement the code or config contradicts. Cite both. Always Must fix. | rewrite |
| dead reference | A link, anchor, path, command or flag that does not exist. | rewrite or remove |
| duplicate | The same content in two docs. Name the one that stays; the other links to it. | remove or move |
| restates | A first sentence that repeats its heading, a table that repeats the code, a recap, a feature count. | remove |
| history | How it came to be, inside a guide. It belongs in release notes. | remove or move |
| missing | A step the reader needs to use or build the thing and cannot find. Found by following the doc. | add |
| unsourced | A claim about an external API, version, price or law without a source. | add the source or flag |
| opening | A README or product page that does not open with what the product does for the reader. | rewrite |

Check commands by looking them up in the package scripts or the help output of the CLI. Run nothing that changes state.

## Not findings

- License, legal and security policy text.
- Anything a reader needs to use, build, change or decide, however long.
- Generated pages: audit their source.
