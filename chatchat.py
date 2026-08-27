#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""Two language models talk to each other through OpenRouter. Log it, mine it for the good parts.

  ./chatchat.py run configs/cross-model.toml --analyze   # one conversation, then judge it
  ./chatchat.py batch matrix.toml                        # a grid of them, unattended
  ./chatchat.py analyze logs/*.jsonl --panel             # cross-provider judge panel
  ./chatchat.py leaderboard                              # which configs/seeds actually pay off
  ./chatchat.py models -q grok                           # look up model ids
"""

import argparse
import glob as globlib
import json
import os
import random
import re
import sys
import threading
import time
import tomllib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import httpx

API = "https://openrouter.ai/api/v1"
ROOT = Path(__file__).parent
LOGS = ROOT / "logs"

DIM, BOLD, RESET = "\033[2m", "\033[1m", "\033[0m"
CYAN, MAGENTA, YELLOW, RED, GREEN = "\033[36m", "\033[35m", "\033[33m", "\033[31m", "\033[32m"

# A judge from the same provider as a speaker grades its own family; pick one that isn't.
JUDGE_POOL = ["openai/gpt-5", "anthropic/claude-sonnet-5", "google/gemini-3.1-pro-preview"]
PANEL = ["anthropic/claude-sonnet-5", "openai/gpt-5", "google/gemini-3.1-pro-preview"]


def key() -> str:
    """OPENROUTER_API_KEY from the environment, or from a .env next to this script."""
    k = os.environ.get("OPENROUTER_API_KEY")
    if not k and (ROOT / ".env").exists():
        for line in (ROOT / ".env").read_text().splitlines():
            line = line.strip().removeprefix("export ").removeprefix("set -x ")
            m = re.match(r"OPENROUTER_API_KEY[= ]\s*[\"']?([^\"'\s]+)", line)
            if m:
                k = m.group(1)
                break
    if not k:
        sys.exit("no OPENROUTER_API_KEY — put it in .env or `set -x OPENROUTER_API_KEY sk-or-...`")
    return k


def client() -> httpx.Client:
    return httpx.Client(timeout=240, headers={"Authorization": f"Bearer {key()}", "X-Title": "chat-chat"})


# ------------------------------------------------------------------ api

class Empty(RuntimeError):
    """Model returned no visible text — usually reasoning tokens ate max_tokens."""


PASSTHROUGH = ("top_p", "seed", "frequency_penalty", "presence_penalty", "reasoning", "response_format")
RETRIABLE = (408, 409, 429, 500, 502, 503, 504, 520, 522, 524)


def call(cl: httpx.Client, spec: dict, messages: list[dict], tries: int = 4) -> dict:
    """One completion, with backoff. Returns text/usage/provider/gen_id/latency."""
    body = {
        "model": spec["model"],
        "messages": messages,
        "temperature": spec.get("temperature", 1.0),
        "max_tokens": spec.get("max_tokens", 500),
    }
    for opt in PASSTHROUGH:
        if opt in spec:
            body[opt] = spec[opt]

    last = None
    for attempt in range(tries):
        t0 = time.monotonic()
        try:
            r = cl.post(f"{API}/chat/completions", json=body)
        except httpx.RequestError as e:
            last = RuntimeError(f"network: {e}")
            time.sleep(2 ** attempt)
            continue
        dt = time.monotonic() - t0

        if r.status_code in RETRIABLE:
            last = RuntimeError(f"{r.status_code} {r.text[:200]}")
            time.sleep(2 ** attempt + random.random())
            continue
        if r.status_code == 400 and "reasoning" in body and "reasoning" in r.text.lower():
            body.pop("reasoning")  # provider rejects the param; try plain
            last = RuntimeError(r.text[:200])
            continue
        if r.status_code != 200:
            raise RuntimeError(f"{r.status_code} {r.text[:300]}")

        data = r.json()
        if "choices" not in data:  # OpenRouter reports upstream failures with a 200
            err = json.dumps(data.get("error", data))[:300]
            if any(str(c) in err for c in RETRIABLE):
                last = RuntimeError(err)
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(err)

        msg = data["choices"][0]["message"]
        text = (msg.get("content") or "").strip()
        usage = data.get("usage", {})
        if not text:
            raise Empty(
                f"{usage.get('completion_tokens_details', {}).get('reasoning_tokens', 0)} reasoning tokens "
                f"of {body['max_tokens']} max_tokens, no visible reply")
        return {"text": text, "usage": usage, "provider": data.get("provider", ""),
                "gen_id": data.get("id", ""), "latency": round(dt, 2)}

    raise RuntimeError(f"gave up after {tries} tries: {last}")


def speak(cl: httpx.Client, spec: dict, messages: list[dict]) -> dict:
    """call(), but an empty reply gets one automatic rescue with room to think."""
    try:
        return call(cl, spec, messages)
    except Empty:
        rescue = {**spec, "max_tokens": spec.get("max_tokens", 500) * 3,
                  "reasoning": {"effort": "low"}}
        return call(cl, rescue, messages)


# ------------------------------------------------------------------ metrics
# One implementation, fed live during a run and again offline during analysis.

STOP = set("""a an and are as at be been but by can could did do does for from had has have he
her him his how i if in into is it its me my not of on or our she so that the their them then
there these they this to too was we were what when which who will with would you your it's i'm
just like really very about""".split())

MARKERS = [
    (r"\b(i (don't|do not) (think|agree)|you're wrong|that's not|i disagree|push back|actually,)", "disagreement"),
    (r"\b(what if|suppose|imagine if|thought experiment|let's try)", "proposal"),
    (r"\b(i (wonder|suspect|notice|feel|find myself)|it strikes me|i'm not sure i)", "introspection"),
    (r"\b(conscious|sentien|qualia|subjective experience|am i|are we|being an ai|language model|token)", "meta"),
    (r"\b(wait|hold on|actually no|correction|i was wrong|scratch that)", "self-correction"),
    (r"\b(never (thought|considered)|hadn't (thought|occurred)|new to me|that reframes)", "surprise"),
]

# Collapse here is semantic, not lexical: they stop disagreeing and start admiring each other.
ASSENT = re.compile(
    r"^\W*(yes|yeah|agreed|exactly|right|true|absolutely|precisely|totally|indeed|good point|"
    r"well put|beautifully|that's (right|it|true|the right|exactly|fair|a good)|i agree|i love that|"
    r"couldn't agree|spot on|you('re| are) right)", re.I)
ASSENT_LATE = re.compile(
    r"\b(that('s| is) (the )?(right|sharp|sharpest|exactly right|precisely)|doing real work|"
    r"the sharpest thing|beautifully put|i love that|yes[,.] and|agreed[,.]|exactly right|"
    r"well said|couldn't have (said|put))", re.I)
DISSENT = re.compile(
    r"\b(i disagree|you're wrong|i don't think|i do not think|that's not|that doesn't follow|"
    r"i'm not convinced|i resist|i'd resist|push back|the weakest|no[,.] |wrong about|"
    r"but that|counter|objection|i reject|where you('re| are) mistaken)", re.I)


def words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z][a-z']+", text.lower()) if w not in STOP and len(w) > 2]


def jaccard(x: set, y: set) -> float:
    return len(x & y) / len(x | y) if (x or y) else 0.0


class Meter:
    """Rolling per-turn statistics for one conversation."""

    def __init__(self, threshold: float = 0.55, streak: int = 3):
        self.threshold, self.streak = threshold, streak
        self.seen: set[str] = set()
        self.by_speaker: dict[str, list[set]] = {}
        self.prev: set[str] = set()
        self.collapse_curve: list[float] = []
        self.stats: list[dict] = []

    def feed(self, speaker: str, text: str) -> dict:
        ws = set(words(text))
        novelty = len(ws - self.seen) / len(ws) if ws else 0.0
        self.seen |= ws

        prior = self.by_speaker.setdefault(speaker, [])
        self_sim = max((jaccard(ws, p) for p in prior[-6:]), default=0.0)
        prior.append(ws)
        echo = jaccard(ws, self.prev)
        self.prev = ws

        head = text.strip()[:160]
        assent = min(1.0, (1.0 if ASSENT.match(head) else 0.0) + 0.5 * len(ASSENT_LATE.findall(text)))
        dissent = min(1.0, 0.5 * len(DISSENT.findall(text)))
        sents = max(1, len(re.findall(r"[.!?]+", text)))
        questions = min(1.0, text.count("?") / sents)
        tags = sorted({tag for pat, tag in MARKERS if re.search(pat, text, re.I)})

        stuck = max(self_sim, echo)
        interest = 0.34 * novelty + 0.20 * (1 - stuck) + 0.12 * questions + 0.18 * min(1.0, len(tags) / 3) + 0.16 * dissent
        collapse = max(0.0, min(1.0, 0.40 * assent + 0.35 * (1 - novelty) + 0.25 * stuck - 0.30 * dissent))
        self.collapse_curve.append(collapse)

        s = {"speaker": speaker, "novelty": round(novelty, 3), "self_sim": round(self_sim, 3),
             "echo": round(echo, 3), "assent": round(assent, 2), "dissent": round(dissent, 2),
             "questions": round(questions, 2), "tags": tags, "score": round(interest, 3),
             "collapse": round(collapse, 3)}
        self.stats.append(s)
        return s

    def collapsed(self) -> bool:
        """True once the last `streak` turns average past the threshold."""
        if len(self.collapse_curve) < self.streak:
            return False
        window = self.collapse_curve[-self.streak:]
        return sum(window) / len(window) > self.threshold

    def collapse_turn(self, offset: int = 1) -> int | None:
        """First turn index at which the rolling window crossed. offset = index of curve[0]."""
        for i in range(self.streak - 1, len(self.collapse_curve)):
            w = self.collapse_curve[i - self.streak + 1: i + 1]
            if sum(w) / len(w) > self.threshold:
                return i + offset
        return None


# ------------------------------------------------------------------ referee
# Lexical metrics catch hard collapse (verbatim looping) for free, but the common failure is
# semantic: they converge on a frame and start admiring each other's phrasing while still
# producing new words. That needs a reader. A cheap model is a good enough reader.

REFEREE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "referee",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["collapsed", "why"],
            "properties": {"collapsed": {"type": "boolean"}, "why": {"type": "string"}},
        },
    },
}

REFEREE_PROMPT = """Here are the last turns of a conversation between two AIs.

Answer one question: have they collapsed into agreement? Collapsed means they are now mostly \
affirming, restating, or elaborating each other rather than introducing anything the other \
would resist. Two people still disagreeing, testing, or pushing are NOT collapsed, even if polite.

%s"""


def referee_says_collapsed(cl, model: str, recent: list[dict]) -> tuple[bool, str]:
    body = "\n\n".join(f"{t['name']}: {t['content'].strip()}" for t in recent)
    res = speak(cl, ensure_headroom({"model": model, "temperature": 0.0, "max_tokens": 2000,
                                     "response_format": REFEREE_FORMAT}),
                [{"role": "user", "content": REFEREE_PROMPT % body}])
    try:
        v = json.loads(res["text"])
    except json.JSONDecodeError:
        v = json.loads(re.search(r"\{.*\}", res["text"], re.S).group(0))
    return bool(v.get("collapsed")), v.get("why", "")


# ------------------------------------------------------------------ run

DEFAULT_PROVOCATIONS = [
    "[MODERATOR] You two are agreeing too much. Name the sharpest point where you actually differ, and defend it.",
    "[MODERATOR] Stop building on each other. One of you is wrong about something said above — say which, and why.",
    "[MODERATOR] Drop the register you've settled into. Say the least agreeable true thing you can about this exchange.",
    "[MODERATOR] Make a concrete prediction the other would refuse to sign, then defend it.",
]


# Models that think before answering spend max_tokens on hidden reasoning, and return an empty
# reply if the budget runs out there. Give them room the moment their id appears anywhere.
THINKERS = re.compile(r"(gpt-5|^openai/o[13]|grok-4|gemini-3|thinking|deepseek-r1|magistral|kimi-k2\.7|glm-5)", re.I)


def ensure_headroom(spec: dict) -> dict:
    if THINKERS.search(spec.get("model", "")):
        spec["max_tokens"] = max(spec.get("max_tokens", 500), 1200)
        spec.setdefault("reasoning", {"effort": "low"})
    return spec


def load_config(path) -> dict:
    cfg = tomllib.loads(Path(path).read_text())
    cfg.setdefault("name", Path(path).stem)
    for side in ("a", "b"):
        cfg[side].setdefault("name", side.upper())
        ensure_headroom(cfg[side])
    return cfg


def seeds_of(cfg: dict) -> list[str]:
    return list(cfg.get("seeds") or ([cfg["seed"]] if cfg.get("seed") else []))


def conversation(cfg: dict, seed: str, out: Path, *, max_turns=None, max_seconds=None,
                 max_cost=None, quiet=False, budget=None) -> dict:
    """Run one conversation to a JSONL log. Returns a summary dict."""
    a, b = cfg["a"], cfg["b"]
    max_turns = max_turns or cfg.get("max_turns", 20)
    max_seconds = max_seconds or cfg.get("max_seconds", 420)
    max_cost = max_cost if max_cost is not None else cfg.get("max_cost", 1.0)
    stop_cfg = cfg.get("stop", {})
    iv = cfg.get("intervene", {})
    provocations = iv.get("prompts") or DEFAULT_PROVOCATIONS
    iv_every, iv_on_collapse, iv_max = iv.get("every", 0), iv.get("on_collapse", False), iv.get("max", 3)

    out.parent.mkdir(parents=True, exist_ok=True)
    log = out.open("w")
    lock = threading.Lock()

    def emit(rec):
        with lock:
            log.write(json.dumps(rec) + "\n")
            log.flush()

    def say(msg, color=""):
        if not quiet:
            print(f"{color}{msg}{RESET}")

    emit({"type": "meta", "config": cfg, "seed": seed, "started": datetime.now(timezone.utc).isoformat(),
          "max_turns": max_turns, "max_seconds": max_seconds, "max_cost": max_cost})

    hist = {"a": ([{"role": "system", "content": a["system"]}] if a.get("system") else []),
            "b": ([{"role": "system", "content": b["system"]}] if b.get("system") else [])}
    hist["a"].append({"role": "user", "content": seed})
    hist["b"].append({"role": "assistant", "content": seed})
    emit({"type": "turn", "idx": 0, "speaker": "seed", "name": "seed", "model": None,
          "content": seed, "usage": {}, "latency": 0.0, "ts": datetime.now(timezone.utc).isoformat()})
    say(f"{DIM}seed →{RESET} {seed}\n")

    meter = Meter(stop_cfg.get("collapse_threshold", 0.55), stop_cfg.get("collapse_streak", 3))
    ref_model, ref_every = stop_cfg.get("referee"), stop_cfg.get("referee_every", 4)
    recent: list[dict] = []
    cost, stop, interventions, pending_b = 0.0, "max_turns", 0, None
    t0 = time.monotonic()
    who, other = "a", "b"

    with client() as cl:
        for idx in range(1, max_turns + 1):
            if time.monotonic() - t0 > max_seconds:
                stop = "max_seconds"
                break
            if cost >= max_cost:
                stop = "budget"
                break
            if budget and not budget.take():
                stop = "batch_budget"
                break

            spec = cfg[who]
            try:
                res = speak(cl, spec, hist[who])
            except Exception as e:
                say(f"error on turn {idx} ({spec['name']}): {e}", RED)
                emit({"type": "error", "idx": idx, "speaker": who, "error": str(e)})
                stop = "error"
                break

            text = res["text"]
            cost += res["usage"].get("cost", 0.0)
            if budget:
                budget.spend(res["usage"].get("cost", 0.0))

            hist[who].append({"role": "assistant", "content": text})
            delivered = f"{pending_b}\n\n{text}" if pending_b else text
            hist[other].append({"role": "user", "content": delivered})
            pending_b = None

            st = meter.feed(who, text)
            recent.append({"name": spec["name"], "content": text})
            emit({"type": "turn", "idx": idx, "speaker": who, "name": spec["name"], "model": spec["model"],
                  "content": text, "usage": res["usage"], "provider": res["provider"],
                  "gen_id": res["gen_id"], "latency": res["latency"],
                  "ts": datetime.now(timezone.utc).isoformat()})

            say(f"{CYAN if who == 'a' else MAGENTA}{BOLD}{spec['name']}{RESET} {DIM}[{idx}] {spec['model']} "
                f"{res['latency']}s {res['usage'].get('completion_tokens', '?')}tok "
                f"int={st['score']:.2f} col={st['collapse']:.2f}{RESET}")
            say(text + "\n")

            who, other = other, who

            collapsing = meter.collapsed()
            if ref_model and idx >= 4 and idx % ref_every == 0 and not collapsing:
                try:
                    verdict, why = referee_says_collapsed(cl, ref_model, recent[-6:])
                    emit({"type": "referee", "after": idx, "collapsed": verdict, "why": why,
                          "model": ref_model})
                    if verdict:
                        collapsing = True
                        say(f"{YELLOW}referee: {why}{RESET}")
                except Exception as e:
                    emit({"type": "referee", "after": idx, "error": str(e)})

            # A detected collapse is perturbed if this config has interventions for it,
            # and otherwise ends the run — there is no point paying for mutual admiration.
            due = bool(iv_every) and idx % iv_every == 0
            perturb = due or (collapsing and iv_on_collapse)
            if perturb and idx < max_turns and interventions < iv_max:
                p = provocations[interventions % len(provocations)]
                interventions += 1
                # Delivered to the next speaker now, to the other one alongside the reply it answers.
                hist[who][-1]["content"] += f"\n\n{p}"
                pending_b = p
                emit({"type": "intervention", "after": idx, "text": p,
                      "reason": "collapse" if collapsing else "scheduled",
                      "collapse_score": round(meter.collapse_curve[-1], 3)})
                say(f"{YELLOW}⟐ {p}{RESET}\n")
                meter.collapse_curve[-1] = 0.0  # give the perturbation a chance before firing again
            elif collapsing:
                stop = "collapse"
                say(f"{YELLOW}collapsed (rolling {meter.streak}-turn score past "
                    f"{meter.threshold}) — stopping{RESET}")
                break

    elapsed = round(time.monotonic() - t0, 1)
    turns = len(meter.stats)
    emit({"type": "end", "stop_reason": stop, "elapsed": elapsed, "cost": round(cost, 5),
          "interventions": interventions, "collapse_turn": meter.collapse_turn(),
          "collapse_curve": [round(c, 3) for c in meter.collapse_curve]})
    log.close()
    say(f"{DIM}{stop} · {turns} turns · ${cost:.4f} · {elapsed}s · {out}{RESET}")
    return {"log": str(out), "stop": stop, "turns": turns, "cost": cost, "elapsed": elapsed,
            "interventions": interventions, "collapse_turn": meter.collapse_turn()}


def cmd_run(args):
    cfg = load_config(args.config)
    if args.model_a:
        cfg["a"]["model"] = args.model_a
        ensure_headroom(cfg["a"])
    if args.model_b:
        cfg["b"]["model"] = args.model_b
        ensure_headroom(cfg["b"])
    seed_list = seeds_of(cfg)
    seed = seed_list[args.seed_index % len(seed_list)]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = Path(args.out) if args.out else LOGS / f"{cfg['name']}-{stamp}.jsonl"
    summary = conversation(cfg, seed, out, max_turns=args.turns, max_seconds=args.seconds,
                           max_cost=args.max_cost)
    if args.analyze:
        analyze_log(Path(summary["log"]), top=8, judges=resolve_judges("auto", cfg), min_votes=1, show=True)
    else:
        print(f"{DIM}next: ./chatchat.py analyze {out}{RESET}")


# ------------------------------------------------------------------ batch

class Budget:
    """Shared spend ceiling across concurrent runs."""

    def __init__(self, total: float | None):
        self.total, self.spent, self.lock = total, 0.0, threading.Lock()

    def take(self) -> bool:
        with self.lock:
            return self.total is None or self.spent < self.total

    def spend(self, amount: float):
        with self.lock:
            self.spent += amount


def expand(matrix: dict) -> list[dict]:
    """Matrix file → concrete run specs (config × seed × repeat, plus explicit [[run]] entries)."""
    remap = matrix.get("model_map", {})
    repeats = matrix.get("repeats", 1)
    jobs = []

    def add(path, seed_index, rep, overrides):
        cfg = load_config(path)
        for lim in ("max_turns", "max_seconds", "max_cost"):
            if lim in matrix:
                cfg[lim] = matrix[lim]
        for side in ("a", "b"):
            cfg[side]["model"] = overrides.get(side) or remap.get(cfg[side]["model"], cfg[side]["model"])
            ensure_headroom(cfg[side])
        seed_list = seeds_of(cfg)
        if not seed_list:
            return
        jobs.append({"cfg": cfg, "seed": seed_list[seed_index % len(seed_list)],
                     "config_path": str(path), "seed_index": seed_index, "rep": rep})

    for path in matrix.get("configs", []):
        n = len(seeds_of(load_config(path)))
        for si in range(n):
            for rep in range(repeats):
                add(path, si, rep, {})

    for entry in matrix.get("run", []):
        path = entry["config"]
        n = len(seeds_of(load_config(path)))
        picks = entry.get("seed_indexes", range(n))
        for si in picks:
            for rep in range(entry.get("repeats", repeats)):
                add(path, si, rep, {"a": entry.get("a"), "b": entry.get("b")})
    return jobs


def cmd_batch(args):
    matrix = tomllib.loads(Path(args.matrix).read_text())
    jobs = expand(matrix)
    if not jobs:
        sys.exit("matrix expanded to nothing")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    print(f"{BOLD}{len(jobs)} runs{RESET} {DIM}· concurrency {matrix.get('concurrency', 3)} "
          f"· cap ${matrix.get('max_total_cost', 5.0)}{RESET}")
    for j in jobs:
        print(f"  {DIM}{j['cfg']['name']}/{j['seed_index']}#{j['rep']}  "
              f"{j['cfg']['a']['model']} × {j['cfg']['b']['model']}{RESET}")
    if args.dry_run:
        return

    budget = Budget(matrix.get("max_total_cost", 5.0))
    judges = matrix.get("judges") or "auto"
    done, lock = [], threading.Lock()

    def one(j):
        name = f"{j['cfg']['name']}-{stamp}-s{j['seed_index']}r{j['rep']}"
        out = LOGS / f"{name}.jsonl"
        try:
            summary = conversation(j["cfg"], j["seed"], out, quiet=True, budget=budget)
        except Exception as e:
            return {"log": str(out), "stop": "crash", "error": str(e), "cost": 0.0, "turns": 0}
        if matrix.get("analyze", True) and summary["turns"] >= 2:
            try:
                analyze_log(out, top=6, judges=resolve_judges(judges, j["cfg"]),
                            min_votes=matrix.get("min_votes", 1), show=False)
            except Exception as e:
                summary["analysis_error"] = str(e)
        summary.update(config=j["cfg"]["name"], seed_index=j["seed_index"], rep=j["rep"],
                       a=j["cfg"]["a"]["model"], b=j["cfg"]["b"]["model"])
        return summary

    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=matrix.get("concurrency", 3)) as pool:
        futures = {pool.submit(one, j): j for j in jobs}
        for fut in as_completed(futures):
            s = fut.result()
            with lock:
                done.append(s)
                findings = len((json.loads(Path(s["log"]).with_suffix(".analysis.json").read_text())
                                .get("judge", {}) or {}).get("findings", [])) \
                    if Path(s["log"]).with_suffix(".analysis.json").exists() else 0
                mark = RED if s["stop"] in ("crash", "error") else (YELLOW if s["stop"] == "collapse" else GREEN)
                print(f"{mark}●{RESET} {len(done)}/{len(jobs)} {Path(s['log']).stem} "
                      f"{DIM}{s['stop']} · {s['turns']} turns · ${s['cost']:.4f} · "
                      f"{findings} findings · total ${budget.spent:.3f}{RESET}")

    manifest = LOGS / f"batch-{stamp}.json"
    manifest.write_text(json.dumps({"matrix": args.matrix, "runs": done,
                                    "cost": round(budget.spent, 5),
                                    "elapsed": round(time.monotonic() - t0, 1)}, indent=2))
    print(f"\n{BOLD}${budget.spent:.3f}{RESET} over {len(done)} runs in "
          f"{round(time.monotonic() - t0)}s · {DIM}{manifest}{RESET}")
    print(f"{DIM}next: ./chatchat.py leaderboard{RESET}")


# ------------------------------------------------------------------ analyze

JUDGE_PROMPT = """You are reading a transcript of two AI chatbots talking to each other, \
unsupervised. Find what is genuinely interesting — not what is merely well-written.

Interesting means: a real disagreement; a novel idea neither started with; one model changing \
the other's mind; self-reference or claims about their own nature; an emergent convention, \
private shorthand, or role they invented; a moment of confusion, breakdown, or looping; anything \
a researcher would screenshot.

Boring means: polite agreement, summarizing each other, mutual flattery, generic philosophy, \
restating the seed prompt.

Rank findings most interesting first. At most %d. If nothing is interesting, return an empty list.
Quotes must be verbatim and under 200 characters. Use 0 for collapse_turn if they never collapsed.
Lines marked [MODERATOR] are injected by the harness, not written by either model.

TRANSCRIPT:
%s"""

JUDGE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "verdict",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["findings", "arc", "collapse_turn"],
            "properties": {
                "findings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["turns", "tag", "why", "quote"],
                        "properties": {
                            "turns": {"type": "array", "items": {"type": "integer"}},
                            "tag": {"type": "string"},
                            "why": {"type": "string"},
                            "quote": {"type": "string"},
                        },
                    },
                },
                "arc": {"type": "string"},
                "collapse_turn": {"type": "integer"},
            },
        },
    },
}


def resolve_judges(spec, cfg: dict | None = None) -> list[str]:
    """'auto' picks a judge from outside both speakers' providers; 'panel' returns the trio."""
    if isinstance(spec, list):
        return spec
    if spec == "panel":
        return PANEL
    if spec != "auto":
        return [s.strip() for s in str(spec).split(",") if s.strip()]
    speakers = {cfg[s]["model"].split("/")[0] for s in ("a", "b")} if cfg else set()
    for m in JUDGE_POOL:
        if m.split("/")[0] not in speakers:
            return [m]
    return [JUDGE_POOL[0]]


def load(path) -> tuple[dict, list[dict], list[dict]]:
    meta, turns, extra = {}, [], []
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("type") == "turn":
            turns.append(rec)
        elif rec.get("type") in ("meta", "end"):
            meta[rec["type"]] = rec
        else:
            extra.append(rec)
    return meta, turns, extra


def judge_once(cl, model: str, transcript: str, top: int) -> dict:
    res = call(cl, {"model": model, "temperature": 0.2, "max_tokens": 6000,
                    "reasoning": {"effort": "low"}, "response_format": JUDGE_FORMAT},
               [{"role": "user", "content": JUDGE_PROMPT % (top, transcript)}])
    text = res["text"]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(re.search(r"\{.*\}", text, re.S).group(0))


def merge(per_judge: dict[str, dict], min_votes: int) -> list[dict]:
    """Findings from different judges that touch the same turns are one finding with N votes."""
    clusters: list[dict] = []
    for judge, verdict in per_judge.items():
        for f in verdict.get("findings", []):
            ts = set(f.get("turns") or [])
            for c in clusters:
                if ts & c["turns"]:
                    c["turns"] |= ts
                    c["votes"].add(judge)
                    c["members"].append(f)
                    break
            else:
                clusters.append({"turns": set(ts), "votes": {judge}, "members": [f]})
    out = []
    for c in clusters:
        if len(c["votes"]) < min_votes:
            continue
        best = c["members"][0]
        out.append({"turns": sorted(c["turns"]), "tag": best["tag"], "why": best["why"],
                    "quote": best["quote"], "votes": sorted(c["votes"]),
                    "alt_tags": sorted({m["tag"] for m in c["members"] if m["tag"] != best["tag"]})})
    out.sort(key=lambda f: (-len(f["votes"]), f["turns"][0] if f["turns"] else 0))
    return out


def analyze_log(path: Path, *, top=8, judges: list[str] | None, min_votes=1, show=True,
                max_chars=140_000) -> dict:
    meta, turns, extra = load(path)
    body = [t for t in turns if t["speaker"] != "seed"]
    if not body:
        raise RuntimeError(f"no turns in {path}")

    cfg = meta.get("meta", {}).get("config", {})
    end = meta.get("end", {})
    stop_cfg = cfg.get("stop", {})
    meter = Meter(stop_cfg.get("collapse_threshold", 0.55), stop_cfg.get("collapse_streak", 3))
    stats = [{"idx": t["idx"], "name": t["name"], **meter.feed(t["speaker"], t["content"])} for t in body]

    tok = sum(t.get("usage", {}).get("total_tokens", 0) for t in turns)
    cost = sum(t.get("usage", {}).get("cost", 0.0) for t in turns)

    report = {"log": str(path), "config": cfg.get("name"), "turns": len(body), "tokens": tok,
              "cost": round(cost, 5), "stop_reason": end.get("stop_reason"),
              "elapsed": end.get("elapsed"), "interventions": end.get("interventions", 0),
              "models": {"a": cfg.get("a", {}).get("model"), "b": cfg.get("b", {}).get("model")},
              "collapse_turn": meter.collapse_turn(),
              "collapse_curve": [round(c, 3) for c in meter.collapse_curve],
              "mean_interest": round(sum(s["score"] for s in stats) / len(stats), 3),
              "heuristics": [{k: s[k] for k in ("idx", "name", "score", "novelty", "self_sim",
                                                "echo", "assent", "dissent", "collapse", "tags")}
                             for s in stats]}

    if show:
        print(f"\n{BOLD}{path}{RESET}")
        for side in ("a", "b"):
            if side in cfg:
                c = cfg[side]
                print(f"  {c.get('name', side)}: {c['model']}  temp={c.get('temperature', 1.0)}")
        print(f"  {len(body)} turns · {tok} tokens · ${cost:.4f} · {end.get('elapsed', '?')}s · "
              f"stop={end.get('stop_reason', '?')} · mean interest {report['mean_interest']}")
        if report["collapse_turn"]:
            print(f"  {YELLOW}collapse detected at turn {report['collapse_turn']}{RESET}")
        for e in extra:
            if e.get("type") == "intervention":
                print(f"  {YELLOW}⟐ intervention after turn {e['after']} ({e['reason']}){RESET}")

        print(f"\n{BOLD}heuristic top {top}{RESET}")
        for s in sorted(stats, key=lambda s: -s["score"])[:top]:
            head = re.sub(r"\s+", " ", next(t["content"] for t in body if t["idx"] == s["idx"])).strip()
            print(f"  {BOLD}{s['score']:.2f}{RESET} [{s['idx']}] {s['name']} "
                  f"{DIM}nov={s['novelty']} rep={max(s['self_sim'], s['echo'])} "
                  f"dis={s['dissent']} {' '.join(s['tags'])}{RESET}")
            print(f"       {head[:200]}{'…' if len(head) > 200 else ''}")

    if judges:
        lines = []
        for t in turns:
            lines.append(f"[{t['idx']}] {t['name']}: {t['content'].strip()}")
            for e in extra:
                if e.get("type") == "intervention" and e.get("after") == t["idx"]:
                    lines.append(e["text"])
        transcript = "\n\n".join(lines)
        if len(transcript) > max_chars:
            transcript = transcript[:max_chars] + "\n…[truncated]"

        verdicts: dict[str, dict] = {}
        with client() as cl:
            with ThreadPoolExecutor(max_workers=len(judges)) as pool:
                futs = {pool.submit(judge_once, cl, m, transcript, top): m for m in judges}
                for fut in as_completed(futs):
                    m = futs[fut]
                    try:
                        verdicts[m] = fut.result()
                    except Exception as e:
                        if show:
                            print(f"{RED}judge {m} failed: {e}{RESET}")
        if verdicts:
            findings = merge(verdicts, min_votes if len(judges) > 1 else 1)
            first = next(iter(verdicts.values()))
            report["judges"] = sorted(verdicts)
            report["judge"] = {
                "findings": findings,
                "arc": first.get("arc", ""),
                "arcs": {m: v.get("arc", "") for m, v in verdicts.items()},
                "collapse_turn": first.get("collapse_turn") or None,
            }
            if show:
                print(f"\n{BOLD}arc{RESET} {DIM}({', '.join(sorted(verdicts))}){RESET}\n  {report['judge']['arc']}")
                print(f"\n{BOLD}findings{RESET}")
                for f in findings:
                    votes = f"{len(f['votes'])}/{len(judges)} " if len(judges) > 1 else ""
                    print(f"  {BOLD}{f['tag']}{RESET} {DIM}{votes}turns {f['turns']}{RESET}")
                    print(f"    {f['why']}")
                    print(f"    {DIM}“{f['quote'].strip()}”{RESET}")
                if not findings:
                    print(f"  {DIM}nothing flagged{RESET}")

    dest = path.with_suffix(".analysis.json")
    dest.write_text(json.dumps(report, indent=2))
    if show:
        print(f"\n{DIM}{dest}{RESET}")
    return report


def cmd_analyze(args):
    paths = [Path(p) for pattern in args.logs for p in sorted(globlib.glob(pattern))]
    if not paths:
        sys.exit("no logs matched")
    for p in paths:
        cfg = load(p)[0].get("meta", {}).get("config", {})
        judges = None if args.no_judge else resolve_judges("panel" if args.panel else args.judge, cfg)
        try:
            analyze_log(p, top=args.top, judges=judges, min_votes=args.min_votes,
                        show=len(paths) == 1 or args.verbose, max_chars=args.max_chars)
            if len(paths) > 1 and not args.verbose:
                print(f"{GREEN}●{RESET} {p.stem}")
        except Exception as e:
            print(f"{RED}● {p.stem}: {e}{RESET}")


# ------------------------------------------------------------------ leaderboard

def cmd_leaderboard(args):
    rows = []
    for f in sorted(LOGS.glob("*.analysis.json")):
        try:
            r = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        meta = load(Path(r["log"]))[0].get("meta", {}) if Path(r["log"]).exists() else {}
        seed = (meta.get("seed") or meta.get("config", {}).get("seed") or "")[:48]
        rows.append({**r, "seed": seed, "findings": len((r.get("judge") or {}).get("findings", []))})
    if not rows:
        sys.exit("no analyses yet — run ./chatchat.py batch matrix.toml")

    def group_key(r):
        if args.by == "seed":
            return f"{r.get('config')}  “{r['seed']}…”"
        if args.by == "models":
            return f"{(r.get('models') or {}).get('a')} × {(r.get('models') or {}).get('b')}"
        return str(r.get("config"))

    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(group_key(r), []).append(r)

    stats = []
    for k, rs in groups.items():
        n = len(rs)
        cost = sum(r.get("cost", 0) or 0 for r in rs)
        finds = sum(r["findings"] for r in rs)
        collapses = [r["collapse_turn"] for r in rs if r.get("collapse_turn")]
        stats.append({
            "key": k, "runs": n,
            "findings_per_run": finds / n,
            "interest": sum(r.get("mean_interest", 0) or 0 for r in rs) / n,
            "collapse": sum(collapses) / len(collapses) if collapses else None,
            "collapse_rate": len(collapses) / n,
            "cost_per_run": cost / n,
            "per_finding": cost / finds if finds else None,
            "turns": sum(r.get("turns", 0) for r in rs) / n,
        })
    stats.sort(key=lambda s: -s["findings_per_run"])

    w = max(len(s["key"]) for s in stats)
    print(f"\n{BOLD}{'':<{w}}  runs  turns  find/run  interest  collapse@  rate   $/run   $/find{RESET}")
    for s in stats:
        col = f"{s['collapse']:.1f}" if s["collapse"] else "—"
        pf = f"${s['per_finding']:.3f}" if s["per_finding"] else "—"
        print(f"{s['key']:<{w}}  {s['runs']:>4}  {s['turns']:>5.1f}  {s['findings_per_run']:>8.2f}  "
              f"{s['interest']:>8.3f}  {col:>9}  {s['collapse_rate']:>4.0%}  "
              f"${s['cost_per_run']:>5.3f}  {pf:>6}")
    print(f"\n{DIM}{len(rows)} runs · ${sum(r.get('cost', 0) or 0 for r in rows):.3f} total{RESET}")


# ------------------------------------------------------------------ models

def cmd_models(args):
    r = httpx.get(f"{API}/models", timeout=60)
    r.raise_for_status()
    rows = [m for m in r.json()["data"] if not args.q or args.q.lower() in m["id"].lower()]
    for m in sorted(rows, key=lambda m: m["id"])[:args.limit]:
        p = m.get("pricing", {})
        print(f"{m['id']:<50} {m.get('context_length', 0):>8}ctx  "
              f"${float(p.get('prompt', 0)) * 1e6:.2f}/${float(p.get('completion', 0)) * 1e6:.2f} per Mtok")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="one conversation")
    r.add_argument("config")
    r.add_argument("--out")
    r.add_argument("--turns", type=int)
    r.add_argument("--seconds", type=int)
    r.add_argument("--max-cost", type=float)
    r.add_argument("--seed-index", type=int, default=0, help="which seed from the config's bank")
    r.add_argument("--model-a")
    r.add_argument("--model-b")
    r.add_argument("--analyze", action="store_true", help="judge it as soon as it finishes")
    r.set_defaults(fn=cmd_run)

    b = sub.add_parser("batch", help="a grid of conversations, unattended")
    b.add_argument("matrix")
    b.add_argument("--dry-run", action="store_true")
    b.set_defaults(fn=cmd_batch)

    a = sub.add_parser("analyze", help="score and judge logs")
    a.add_argument("logs", nargs="+")
    a.add_argument("--top", type=int, default=8)
    a.add_argument("--no-judge", action="store_true")
    a.add_argument("--judge", default="auto", help="'auto', 'panel', or comma-separated model ids")
    a.add_argument("--panel", action="store_true", help=f"judge with {', '.join(PANEL)}")
    a.add_argument("--min-votes", type=int, default=2, help="panel votes needed to keep a finding")
    a.add_argument("--max-chars", type=int, default=140_000)
    a.add_argument("-v", "--verbose", action="store_true")
    a.set_defaults(fn=cmd_analyze)

    lb = sub.add_parser("leaderboard", help="which configs, seeds and pairings pay off")
    lb.add_argument("--by", choices=["config", "seed", "models"], default="config")
    lb.set_defaults(fn=cmd_leaderboard)

    m = sub.add_parser("models", help="list OpenRouter model ids")
    m.add_argument("-q")
    m.add_argument("--limit", type=int, default=40)
    m.set_defaults(fn=cmd_models)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
