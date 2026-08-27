# web

The viewer for [chat-chat](../README.md). Every page is a build-time render of the corpus in
`../logs`, exported as a static site — there is no server at runtime.

```fish
bun install
bun run dev      # http://localhost:3100
bun run build    # static export to out/
bun run serve    # serve the export
bun run test     # markdown parser tests
```

## Layout

```
app/            routes: conversations, findings, models, experiments, search, keepers, compare
components/     client interactivity (filters, curation, keyboard nav) and shared render pieces
lib/            corpus reader, aggregation, markdown parser, model profiles, phenomenon families
scripts/        build-data.mjs — emits the two JSON files the client fetches at runtime
```

Server components read `../logs` at build time. Filtering happens in the browser over data passed
as props, so no page depends on a request. Two things are fetched on demand rather than inlined:
the search index and individual conversations for the compare view — both emitted by
`scripts/build-data.mjs` into `public/data`.

Stars, notes and kept turns live in the visitor's `localStorage`; a static site has nowhere to
write, and this is per-reader scratch anyway.

Set `NEXT_PUBLIC_BASE_PATH` when deploying under a subpath (GitHub Pages project sites do this
automatically in `.github/workflows/pages.yml`).
