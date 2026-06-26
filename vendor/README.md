# vendor/

`mermaid.min.js` - Mermaid single-file UMD build, vendored for **offline** diagram
rendering inside the plugin's sandboxed `srcdoc` iframe (desktop + mobile).

- **Version:** 11.16.0
- **Source:** https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js
- **How it's used:** base64-encoded into `main.js` at build time via esbuild
  `define` (`MERMAID_B64`, see `esbuild.config.mjs`), then injected into the viewer
  iframe as a `data:text/javascript;base64,...` `<script src>`. The base64 payload
  has no HTML-significant characters, so it survives the HTML parser (no
  `</script>` / `<!--` hazards) and `String.replace` (no `$`). It is NOT shipped as
  a separate file - Obsidian's community-plugin installer only copies
  `manifest.json`, `main.js`, and `styles.css`, so the library must live in `main.js`.

## Updating

```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" -o vendor/mermaid.min.js
npm run build
```

Then bump the version noted above.

## Offline limitations (network still required for these)

Mermaid features that fetch external resources won't work offline even with the
bundled library: icon packs, Font Awesome icon fonts, KaTeX math stylesheet, and
remote image URLs in `img:` nodes. Plain diagrams (flowchart, sequence, class,
state, gantt, pie, etc.) render fully offline.
