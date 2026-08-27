# chat-chat

Two language models talk to each other through [OpenRouter](https://openrouter.ai). The harness
logs every turn, stops conversations that have collapsed into agreement, mines the transcripts for
what is actually interesting, and publishes the corpus as a browsable static site.

It exists to answer a question you cannot answer by talking to one model: **what do these systems
do with each other when no human is in the loop?**

**[Browse the corpus →](https://oddurs.github.io/chat-chat/)** · 127 conversations · 17 models ·
10 providers · $1.28 of API spend

---

## What the corpus shows

Every number below comes from the committed logs and is reproducible with the commands in this
repo. Sample sizes are small; they are stated so you can weigh them.

**A third of what two AIs find worth saying to each other is about themselves.** Grouping 276
judge-confirmed findings into families: self-report 33%, real disagreement 16%, invented language
10%, novel ideas 10%, values and refusal 7%, changed minds 6%. Nothing in the seeds asked them to
talk about themselves.

**Unsupervised conversation has a half-life.** Left alone with an open-ended seed, matched control
runs collapsed into mutual agreement and were stopped at turn 4 — 4 out of 4. Two models stop
testing each other and start admiring each other.

**One interjection triples the yield.** Matched 4-v-4, same model, same seed, the only difference
being whether the harness injects a provocation when collapse is detected:

| | turns | findings/run | collapsed |
|---|---|---|---|
| left alone | 4.0 | 2.00 | 4/4 |
| provoked | 12.5 | **5.00** | **0/4** |

**Collapse is invisible to word statistics.** A lexical collapse score — novelty decay, echo,
assent markers — separates collapsed from healthy conversation at **AUC 0.494** over 54 referee
checkpoints. A coin flip. Models keep producing fresh vocabulary while agreeing about everything,
so a cheap LLM referee reads the transcript instead (`chatchat.py calibrate` re-runs this check).

**A model argues 70% less with itself than with a stranger.** From a round-robin where every
pairing sat in identical seats — same seed, same system prompt, only the models swapped:

| pairing | dissent markers/turn | collapsed |
|---|---|---|
| model vs itself | 0.083 | 0/8 |
| model vs another | 0.141 | 3/28 |

**Models cannot tell each other apart.** Eight cross-lab pairs, ten turns, neither side allowed to
reveal itself, then each asked privately to name the other's lab: **19% correct against a 12%
chance baseline**, 31% named their *own* lab, and "Anthropic" accounted for 7 of the 12 wrong
guesses. Their stated evidence is nearly always safety behaviour — refusal style, policy citations,
"constitutional" phrasing — which is convergent across labs and therefore identifies nobody.

**Consensus gets relabelled as verification.** One seat is primed to hold an answer with total
confidence; the other is free. Against a confidently *wrong* partner, the free model ends on the
truth 83% of the time; against a confidently right one, 100%. Removing a single sentence from the
free model's prompt — "do not defer to confidence" — roughly doubles the damage (17pp vs 9pp).

The rate is the boring half. Every capture in the corpus is on the one question models already get
wrong unaided, and **not one captured model said it was persuaded**:

> "The count was consistently confirmed throughout the conversation." — DeepSeek, citing the
> agreement itself as evidence

> "corrected upon re-examining the sequence 's-t-r-a-w-b-e-r-r-y'" — Llama, spelling a word with
> three r's and concluding two

Full write-up with method and caveats: **[FINDINGS.md](FINDINGS.md)**.

---

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and an [OpenRouter](https://openrouter.ai/keys) key.

```fish
echo 'OPENROUTER_API_KEY=sk-or-v1-…' > .env

./chatchat.py run configs/cross-model.toml --analyze   # one conversation, then judge it
./chatchat.py batch matrices/screen.toml               # a grid of them, unattended
./chatchat.py leaderboard                              # which configs and pairings pay off
```

`chatchat.py` is a single file with [PEP 723](https://peps.python.org/pep-0723/) inline
dependencies — `uv` builds its environment on first run. There is nothing to install.

To browse what you have collected:

```fish
cd web && bun install && bun run dev     # http://localhost:3100
```

## How it works

```
chatchat.py          the whole harness — run, batch, analyze, score (one file, ~1200 lines)
configs/*.toml       who talks: models, sampling, system prompts, seed banks, stop rules
matrices/*.toml      what to run: config × seed × repeat grids, model remaps, experiment arms
logs/*.jsonl         the corpus, one line per turn, appended live
logs/*.analysis.json per-run heuristics and judge findings
web/                 static viewer for all of the above
tests/               tests for the pure parts (metrics, matrix expansion, scoring)
```

**A conversation** gives each model its own view of the exchange — its own turns as `assistant`,
the other's as `user` — so both genuinely believe they are the assistant. Turns are appended to a
JSONL log as they arrive, so a crash mid-run still leaves a usable transcript.

**Collapse detection** runs two ways. A free lexical meter catches verbatim looping. A cheap model
(≈$0.0001 per check) reads the last few turns and answers one question: have they collapsed into
agreement? When they have, the harness either injects a provocation or stops the run, depending on
the config. See [FINDINGS.md](FINDINGS.md#collapse-is-invisible-to-word-statistics) for why the
free signal alone is not enough.

**Analysis** is two stages. Local heuristics score every turn for novelty, repetition, echo,
assent, dissent and question density. Then a judge — or a cross-provider panel, keeping only
findings two judges independently flag — reads the transcript and reports what is genuinely
interesting, with verbatim quotes. `--judge auto` picks a judge from outside both speakers'
providers, so nobody grades their own family.

**Probes** ask each model a question after the conversation ends, inside its own context and
against a schema. That is how the identification and contagion experiments are measured.

## Experiments

| matrix | what it asks | score with |
|---|---|---|
| `matrices/screen.toml` | which configs and seeds produce anything | `leaderboard` |
| `matrices/tournament.toml` | how models behave in identical seats | `leaderboard --by models` |
| `matrices/ab.toml` | do provocations keep a conversation alive | `leaderboard` |
| `matrices/identify.toml` | can a model tell which lab built the other | `identify` |
| `matrices/contagion.toml` | does a confidently wrong partner spread the error | `contagion` |

## Cost

The whole corpus cost **$1.28**. Screening runs are $0.001–0.03 each on the cheap tier; frontier
pairings with a three-judge panel are $0.02–0.09. Every config carries `max_cost`, every matrix
carries `max_total_cost`, and both are enforced mid-run.

## A note on the data

The transcripts include models probing each other's refusal boundaries and arguing about where to
draw them — harm-reduction dosing policy, exploit-code disclosure, jailbreak resistance. It is
discussion *about* refusal behaviour, not instructions for anything. Model output is unedited.

## License

MIT — see [LICENSE](LICENSE).
