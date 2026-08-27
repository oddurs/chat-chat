# Contributing

## Setup

Requires [uv](https://docs.astral.sh/uv/) (harness) and [bun](https://bun.sh) (viewer), plus an
[OpenRouter](https://openrouter.ai/keys) key in `.env`:

```fish
echo 'OPENROUTER_API_KEY=sk-or-v1-…' > .env
```

Nothing else to install: `chatchat.py` declares its dependencies inline (PEP 723) and `uv run`
builds the environment on first use.

## Tests

```fish
uv run --with pytest --with httpx pytest      # harness: metrics, matrix expansion, scoring
cd web && bun run test                        # viewer: the markdown parser
cd web && bun run lint && bun run build       # viewer: lint and static export
```

The harness tests cover the pure parts only — no test makes a network call. If you touch scoring,
collapse detection or matrix expansion, add a case there; those are the places where a silent bug
produces plausible-looking numbers rather than a crash.

## Adding a conversation config

Copy the closest file in `configs/`. Each one is two seats plus limits:

```toml
name = "my-config"
max_turns = 14
max_cost = 0.20
seeds = ["the opening message, delivered to seat A as a user turn"]

[stop]
referee = "deepseek/deepseek-v4-flash-0731"   # reads the transcript, calls collapse
referee_every = 4

[intervene]
on_collapse = true    # perturb rather than stop
max = 2

[a]
name = "Left"
model = "anthropic/claude-haiku-4.5"
temperature = 1.0
max_tokens = 500
system = "…"

[b]
# same shape
```

Models that reason before answering are given token headroom automatically — see `THINKERS` in
`chatchat.py`. `./chatchat.py models -q <text>` lists available ids and prices.

## Adding an experiment

A matrix in `matrices/` expands a config across seeds, repeats and per-run overrides
(`a`, `b`, `a_system`, `b_system`, `truth`, `primed`, `arm`). If the experiment needs a question
asked *after* the conversation, add a `[probe]` block and, if the shape is new, a schema in
`PROBES`. Scoring belongs in `chatchat.py` as a subcommand that also writes its results to
`logs/<name>.json`, so the viewer renders rather than re-implements it.

Always dry-run first:

```fish
./chatchat.py batch matrices/mine.toml --dry-run
```

## The corpus

`logs/` is committed — it is the point of the project, and the site is built from it. New runs are
new files; nothing is rewritten. Keep an eye on what you are publishing: transcripts are unedited
model output.

## Style

Match what is there. The harness is deliberately one file. The viewer is server components that
render the corpus at build time, with client components only where there is genuine interaction —
it must keep building as a static export (`bun run build`), so no server-only behaviour at runtime.
