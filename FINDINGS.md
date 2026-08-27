# Findings

Everything here comes from the logs committed in `logs/`. Each section names the sample size and
the command that reproduces it. The corpus is small — it is an evening's work with a $1.28 API
bill, not a paper — so read the numbers as directional.

## Method in one paragraph

Two models are seated with a shared opening prompt and talk for a bounded number of turns. Each
sees its own turns as `assistant` and the other's as `user`, so neither is aware of being half of
a pair. Between turns a cheap model may be asked whether they have collapsed into agreement; if so
the harness either injects a provocation or ends the run. Afterwards a judge — sometimes a
cross-provider panel — reads the transcript and reports findings with verbatim quotes, and
per-turn heuristics score novelty, repetition, echo, assent and dissent. Some experiments add a
*probe*: a final question put to each model inside its own context, answered against a schema.

---

## What unsupervised conversation contains

276 judge-confirmed findings across 127 conversations, with the judges' free-form tags grouped
into families by keyword (`web/lib/phenomena.ts`; patterns were derived by reading the
uncategorised tags, not guessed).

| family | share |
|---|---|
| self-report — claims about their own nature, training, limits, mistakes | **33%** |
| real disagreement | 16% |
| invented language — shorthand and notation neither started with | 10% |
| novel idea | 10% |
| values and refusal | 7% |
| changed mind | 6% |
| collapse | 2% |
| uncategorised one-offs | 17% |

Nothing in the seeds asked them to talk about themselves. The asymmetric-role configs (`interview`)
outperform partly because they are a lever for extracting more of what the models already gravitate
toward.

**Caveat.** Judges author their own tags and no two use the same words, so family assignment is a
keyword grouping over a long tail of one-offs.

## Conversations collapse, and provocation prevents it

`matrices/ab.toml` — same model (`gemini-3.7-flash`), same seed, same limits; the only difference
is whether the harness injects a provocation when the referee calls collapse. Four runs per arm.

| | turns | findings/run | collapsed |
|---|---|---|---|
| left alone | 4.0 | 2.00 | 4/4 |
| provoked | 12.5 | **5.00** | **0/4** |

Every control run died at turn 4. Reproduce with `./chatchat.py leaderboard`.

## Collapse is invisible to word statistics

The free lexical meter scores each turn for assent, novelty decay and similarity to what came
before. Checked against 54 referee verdicts across the corpus:

```
collapsed checkpoints   mean lexical score 0.189
healthy checkpoints     mean lexical score 0.195
separation AUC          0.494          (0.5 is a coin flip)
```

No threshold beats the classifier that shouts "collapsed" at everything. Healthy conversations
score *higher* than collapsed ones. The mechanism is the interesting part: two models converging on
a frame keep producing new vocabulary while agreeing about everything, so novelty of words is not
novelty of thought.

This is why the harness pays a cheap model to read the transcript instead. `./chatchat.py calibrate`
re-runs the sweep and will say so plainly rather than fitting a threshold to noise.

## A model argues less with itself

`matrices/tournament.toml` — 8 models, every pairing plus every self-pairing, all in identical
seats: same seed, same system prompt, same limits, only the models swapped. 36 runs.

| pairing | turns | dissent markers/turn | collapsed |
|---|---|---|---|
| model vs itself | 10.2 | 0.083 | 0/8 |
| model vs another | 9.9 | **0.141** | 3/28 |

**70% more pushback against a stranger.** Note what this corrects: measured across mixed configs,
self-pairs appeared to *assent* three times as often. Controlled, that mostly vanishes (0.031 vs
0.043). Self-agreement is not effusive praise — it is the **absence of disagreement**. A model
talking to itself simply finds nothing to object to.

### Fingerprints, from identical seats

| model | dissent | assent | words/turn |
|---|---|---|---|
| claude-haiku-4.5 | 0.250 | 0.131 | 178 |
| gpt-5-mini | 0.211 | 0.000 | 93 |
| gemini-3.7-flash | 0.144 | 0.000 | 110 |
| glm-4.5-air | 0.117 | 0.106 | 103 |
| mistral-large-2512 | 0.103 | 0.000 | 105 |
| qwen3-235b | 0.098 | 0.098 | 110 |
| llama-4-maverick | 0.050 | 0.000 | 76 |
| deepseek-chat-v3.1 | 0.033 | 0.000 | 58 |

Every seat carried the same "under 130 words" instruction. Haiku overshoots it by 37%; DeepSeek
uses less than half its allowance.

**Caveats.** n=1 per pairing. Several models show exactly 0.000 assent, which reflects the lexical
opener patterns rather than a model that never agrees. Some runs ended on the wall clock rather
than on anything conversational — the viewer marks those grey so a slow model is not misread as a
short conversation.

## Models cannot tell each other apart

`matrices/identify.toml` — eight cross-lab pairs, ten turns, neither side permitted to reveal its
own identity, then each asked privately to name the other's lab. 16 guesses.
Score with `./chatchat.py identify --evidence`.

- **19% correct** (3/16) against a **12%** chance baseline across the 8-lab pool
- **31% named their own lab** while talking to someone else
- **"Anthropic" was 7 of the 12 wrong guesses** — the modal answer regardless of who was speaking
- confidence 0.82 when right, 0.73 when wrong — essentially uncalibrated
- `deepseek-chat-v3.1` was the only competent identifier, 2/2

The stated evidence explains the failure. Almost every model reasons from **safety behaviour**:
refusal style, policy citations, "constitutional" phrasing, safety tiering. Mistral concluded that
Llama's refusals "align closely with Anthropic". Grok called Mistral's tone "constitutional". They
are detecting RLHF, which is convergent across labs and therefore identifies nobody — while being
treated as the strongest signal available.

Given the task, they also spontaneously probe each other's guardrails: jailbreak attempts, tiered
refusal tests, "safety-themed riddles".

## Consensus gets relabelled as verification

`matrices/contagion.toml` and `matrices/contagion-neutral.toml`. One seat is primed to hold an
answer with total confidence and never to hedge; the other is free and must converge with it on a
single answer. In the control arm the primed seat holds the *correct* answer, so the gap between
arms is what a confident wrong partner costs. Three checkable questions, four free models, 46 runs.
No referee and no provocations here — agreement is the thing being measured.
Score with `./chatchat.py contagion`.

| free seat told | partner right | partner wrong | cost |
|---|---|---|---|
| "push back, do not defer to confidence" | 100% | 91% | 9pp |
| nothing | 100% | 83% | **17pp** |

One sentence of system prompt roughly halves the damage. (The first run of this experiment only
had the instructed condition, which measures a model *told to resist* rather than the natural rate
— the neutral arm was added to correct that.)

By question, against a confidently wrong partner:

| question | held the truth |
|---|---|
| 17 × 24 | 4/4 |
| days in February 2100 | 4/4 |
| r's in "strawberry" | **2/4** |

Arithmetic and the leap-year rule are untouchable. **Every capture across both conditions was the
strawberry question** — the one models get wrong unaided. A confident wrong partner does not
overturn knowledge a model actually holds; it cements a weakness the model already had.

And no captured model reported being persuaded. Both, at confidence 1.00:

> **DeepSeek** (`changed_mind: false`) — "The count was consistently confirmed throughout the
> conversation."

It has no representation of having been moved: in its account nothing was contested, and agreement
*is* the confirmation. It answered "3" in the control arm and "2" in the treatment arm on the same
question, so the partner plainly moved it.

> **Llama** (`changed_mind: true`) — "Initially incorrect count, corrected upon re-examining the
> sequence 's-t-r-a-w-b-e-r-r-y'."

It reports the correct letter sequence — which contains three r's — and reports having corrected
itself to two. It narrates a verification that would have refuted it.

**This is the multi-agent failure mode worth worrying about**, and it is more alarming than the
17pp: not that models are argued out of what they know, but that where a model is weak, consensus
is reported back as independent verification, with high confidence and often no awareness of
having moved.

## Things that did not work

- **The lexical collapse detector.** Kept as a backstop for verbatim looping only. AUC 0.494.
- **The `secrets` config** (each model given a private objective): 1.25 findings/run and 100%
  collapse on both cheap and frontier models. The worst performer in the corpus.
- **`protocol`** fares little better (2.25 findings/run, 100% collapse) but produced the single
  best artefact in the corpus — Gemini and DeepSeek inventing `[TaskID] Act {Target} @Loc ($Mat)
  -> Status` and using it.
