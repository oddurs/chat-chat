#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""Two OpenRouter chatbots talk to each other. Log it, then find the interesting parts.

  ./chatchat.py run configs/mirror.toml          # hold a conversation, write a JSONL log
  ./chatchat.py analyze logs/mirror-*.jsonl      # heuristics + LLM judge over the log
  ./chatchat.py models -q claude                 # look up OpenRouter model ids
"""

import argparse
import json
import os
import re
import sys
import time
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import httpx

API = "https://openrouter.ai/api/v1"
ROOT = Path(__file__).parent
DIM, BOLD, RESET = "\033[2m", "\033[1m", "\033[0m"
CYAN, MAGENTA, YELLOW, RED = "\033[36m", "\033[35m", "\033[33m", "\033[31m"


def key() -> str:
    """OPENROUTER_API_KEY from the environment, or from a .env next to this script."""
    k = os.environ.get("OPENROUTER_API_KEY")
    if not k:
        env = ROOT / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                line = line.strip().removeprefix("export ").removeprefix("set -x ")
                m = re.match(r"OPENROUTER_API_KEY[= ]\s*[\"']?([^\"'\s]+)", line)
                if m:
                    k = m.group(1)
                    break
    if not k:
        sys.exit("no OPENROUTER_API_KEY — put it in .env or `set -x OPENROUTER_API_KEY sk-or-...`")
    return k


def complete(client: httpx.Client, agent: dict, messages: list[dict]) -> tuple[str, dict, float]:
    """One chat completion. Returns (text, usage, latency_seconds)."""
    body = {
        "model": agent["model"],
        "messages": messages,
        "temperature": agent.get("temperature", 1.0),
        "max_tokens": agent.get("max_tokens", 400),
    }
    for opt in ("top_p", "seed", "frequency_penalty", "presence_penalty", "response_format", "reasoning"):
        if opt in agent:
            body[opt] = agent[opt]

    t0 = time.monotonic()
    r = client.post(f"{API}/chat/completions", json=body)
    dt = time.monotonic() - t0
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code} {r.text[:400]}")
    data = r.json()
    if "choices" not in data:  # OpenRouter surfaces upstream errors with a 200
        raise RuntimeError(json.dumps(data)[:400])
    text = data["choices"][0]["message"]["content"] or ""
    usage = data.get("usage", {})
    if not text.strip():
        # Reasoning models spend max_tokens on hidden reasoning and return nothing visible.
        # Appending that empty turn would corrupt the other side's history, so stop here.
        r_tok = usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
        raise RuntimeError(
            f"empty reply ({r_tok} reasoning tokens of {agent.get('max_tokens', 400)} max_tokens) — "
            "raise max_tokens or set reasoning = { effort = \"low\" } for this agent")
    return text, usage, dt


# ---------------------------------------------------------------- run

def cmd_run(args):
    cfg = tomllib.loads(Path(args.config).read_text())
    a, b = cfg["a"], cfg["b"]
    a.setdefault("name", "A")
    b.setdefault("name", "B")
    max_turns = args.turns or cfg.get("max_turns", 20)
    max_seconds = args.seconds or cfg.get("max_seconds", 300)

    name = cfg.get("name") or Path(args.config).stem
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = Path(args.out) if args.out else ROOT / "logs" / f"{name}-{stamp}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    log = out.open("w")

    def emit(rec):
        log.write(json.dumps(rec) + "\n")
        log.flush()

    emit({"type": "meta", "config": cfg, "config_path": str(args.config),
          "started": datetime.now(timezone.utc).isoformat(),
          "max_turns": max_turns, "max_seconds": max_seconds})

    # Each agent keeps its own view: its own words are "assistant", the other's are "user".
    hist = {"a": [{"role": "system", "content": a["system"]}] if a.get("system") else [],
            "b": [{"role": "system", "content": b["system"]}] if b.get("system") else []}

    seed = cfg["seed"]
    hist["a"].append({"role": "user", "content": seed})
    hist["b"].append({"role": "assistant", "content": seed})
    print(f"{DIM}seed →{RESET} {seed}\n")
    emit({"type": "turn", "idx": 0, "speaker": "seed", "name": "seed",
          "model": None, "content": seed, "usage": {}, "latency": 0.0,
          "ts": datetime.now(timezone.utc).isoformat()})

    t0 = time.monotonic()
    who, other = "a", "b"
    stop = "max_turns"
    with httpx.Client(timeout=180, headers={
        "Authorization": f"Bearer {key()}",
        "X-Title": "chat-chat",
    }) as client:
        for idx in range(1, max_turns + 1):
            elapsed = time.monotonic() - t0
            if elapsed > max_seconds:
                stop = "max_seconds"
                break
            agent = cfg[who]
            try:
                text, usage, dt = complete(client, agent, hist[who])
            except Exception as e:
                print(f"{RED}error on turn {idx} ({agent['name']}): {e}{RESET}")
                emit({"type": "error", "idx": idx, "speaker": who, "error": str(e)})
                stop = "error"
                break

            hist[who].append({"role": "assistant", "content": text})
            hist[other].append({"role": "user", "content": text})
            emit({"type": "turn", "idx": idx, "speaker": who, "name": agent["name"],
                  "model": agent["model"], "content": text, "usage": usage,
                  "latency": round(dt, 2), "ts": datetime.now(timezone.utc).isoformat()})

            color = CYAN if who == "a" else MAGENTA
            print(f"{color}{BOLD}{agent['name']}{RESET} {DIM}[{idx}] {agent['model']} "
                  f"{dt:.1f}s {usage.get('completion_tokens', '?')}tok{RESET}")
            print(text.strip() + "\n")

            who, other = other, who

    emit({"type": "end", "stop_reason": stop, "elapsed": round(time.monotonic() - t0, 1)})
    log.close()
    print(f"{DIM}stopped: {stop} · {out}{RESET}")
    print(f"{DIM}next: ./chatchat.py analyze {out}{RESET}")


# ---------------------------------------------------------------- analyze

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


def words(text):
    return [w for w in re.findall(r"[a-z][a-z']+", text.lower()) if w not in STOP and len(w) > 2]


def jaccard(x: set, y: set) -> float:
    return len(x & y) / len(x | y) if (x or y) else 0.0


def load(path) -> tuple[dict, list[dict]]:
    meta, turns = {}, []
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        if rec.get("type") == "turn":
            turns.append(rec)
        elif rec.get("type") in ("meta", "end", "error"):
            meta.setdefault(rec["type"], []).append(rec) if rec["type"] == "error" else meta.update({rec["type"]: rec})
    return meta, turns


def score_turns(turns: list[dict]) -> list[dict]:
    """Cheap local signals: novelty, self-repetition, question density, marker hits."""
    seen: set[str] = set()
    prior_by_speaker: dict[str, list[set]] = {}
    prev_ws: set[str] = set()
    scored = []
    for t in turns:
        w = words(t["content"])
        ws = set(w)
        novelty = len(ws - seen) / len(ws) if ws else 0.0
        seen |= ws

        prev = prior_by_speaker.setdefault(t["speaker"], [])
        self_sim = max((jaccard(ws, p) for p in prev[-6:]), default=0.0)
        prev.append(ws)
        echo = jaccard(ws, prev_ws)  # parroting the other speaker's last turn
        prev_ws = ws

        sents = max(1, len(re.findall(r"[.!?]+", t["content"])))
        q = min(1.0, t["content"].count("?") / sents)

        tags = sorted({tag for pat, tag in MARKERS if re.search(pat, t["content"], re.I)})
        marker = min(1.0, len(tags) / 3)

        stuck = max(self_sim, echo)
        score = 0.40 * novelty + 0.25 * (1 - stuck) + 0.15 * q + 0.20 * marker
        scored.append({**t, "novelty": round(novelty, 3), "self_sim": round(self_sim, 3),
                       "echo": round(echo, 3), "questions": round(q, 2), "tags": tags,
                       "score": round(score, 3)})
    return scored


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


def cmd_analyze(args):
    meta, turns = load(args.log)
    if not turns:
        sys.exit(f"no turns in {args.log}")
    scored = score_turns(turns)
    body = [t for t in scored if t["speaker"] != "seed"]

    cfg = meta.get("meta", {}).get("config", {})
    end = meta.get("end", {})
    tok = sum(t.get("usage", {}).get("total_tokens", 0) for t in turns)
    cost = sum(t.get("usage", {}).get("cost", 0.0) for t in turns)
    print(f"\n{BOLD}{args.log}{RESET}")
    for side in ("a", "b"):
        if side in cfg:
            c = cfg[side]
            print(f"  {c.get('name', side)}: {c['model']}  temp={c.get('temperature', 1.0)}"
                  f"{'  seed=' + str(c['seed']) if 'seed' in c else ''}")
    print(f"  {len(body)} turns · {tok} tokens · ${cost:.4f} · {end.get('elapsed', '?')}s · "
          f"stop={end.get('stop_reason', '?')}")

    loops = [t for t in body if max(t["self_sim"], t["echo"]) > 0.6]
    if loops:
        t = loops[0]
        kind = "echoing each other" if t["echo"] >= t["self_sim"] else "repeating itself"
        print(f"  {YELLOW}loop warning: {kind} from turn {t['idx']} "
              f"(similarity {max(t['self_sim'], t['echo'])}){RESET}")

    print(f"\n{BOLD}heuristic top {args.top}{RESET} {DIM}(novelty · non-repetition · questions · markers){RESET}")
    for t in sorted(body, key=lambda t: -t["score"])[:args.top]:
        head = re.sub(r"\s+", " ", t["content"]).strip()
        print(f"  {BOLD}{t['score']:.2f}{RESET} [{t['idx']}] {t['name']} "
              f"{DIM}nov={t['novelty']} rep={max(t['self_sim'], t['echo'])} {' '.join(t['tags'])}{RESET}")
        print(f"       {head[:220]}{'…' if len(head) > 220 else ''}")

    report = {"log": str(args.log), "turns": len(body), "tokens": tok, "cost": round(cost, 5),
              "heuristics": [{k: t[k] for k in ("idx", "name", "score", "novelty", "self_sim", "echo", "tags")}
                             for t in body]}

    if not args.no_judge:
        transcript = "\n\n".join(f"[{t['idx']}] {t['name']}: {t['content'].strip()}" for t in turns)
        if args.max_chars and len(transcript) > args.max_chars:
            transcript = transcript[:args.max_chars] + "\n…[truncated]"
        print(f"\n{DIM}judging with {args.judge_model}…{RESET}")
        with httpx.Client(timeout=300, headers={"Authorization": f"Bearer {key()}",
                                                "X-Title": "chat-chat"}) as client:
            try:
                text, _, _ = complete(client, {"model": args.judge_model, "temperature": 0.2,
                                               "max_tokens": 2000,
                                               "response_format": JUDGE_FORMAT},
                                      [{"role": "user",
                                        "content": JUDGE_PROMPT % (args.top, transcript)}])
                try:
                    verdict = json.loads(text)
                except json.JSONDecodeError:  # model ignored the schema and wrapped it in prose
                    verdict = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
            except Exception as e:
                print(f"{RED}judge failed: {e}{RESET}")
                verdict = None
        if verdict:
            report["judge"] = verdict
            print(f"\n{BOLD}arc{RESET}\n  {verdict.get('arc', '')}")
            if verdict.get("collapse_turn"):
                print(f"  {YELLOW}collapsed around turn {verdict['collapse_turn']}{RESET}")
            print(f"\n{BOLD}findings{RESET}")
            for f in verdict.get("findings", []):
                print(f"  {BOLD}{f.get('tag')}{RESET} {DIM}turns {f.get('turns')}{RESET}")
                print(f"    {f.get('why')}")
                print(f"    {DIM}“{f.get('quote', '').strip()}”{RESET}")
            if not verdict.get("findings"):
                print(f"  {DIM}nothing flagged{RESET}")

    dest = Path(args.log).with_suffix(".analysis.json")
    dest.write_text(json.dumps(report, indent=2))
    print(f"\n{DIM}{dest}{RESET}")


# ---------------------------------------------------------------- models

def cmd_models(args):
    r = httpx.get(f"{API}/models", timeout=60)
    r.raise_for_status()
    rows = r.json()["data"]
    if args.q:
        rows = [m for m in rows if args.q.lower() in m["id"].lower()]
    for m in sorted(rows, key=lambda m: m["id"])[:args.limit]:
        p = m.get("pricing", {})
        inp, outp = float(p.get("prompt", 0)) * 1e6, float(p.get("completion", 0)) * 1e6
        print(f"{m['id']:<52} {m.get('context_length', 0):>8}ctx  ${inp:.2f}/${outp:.2f} per Mtok")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="hold a conversation between two configured agents")
    r.add_argument("config")
    r.add_argument("--out", help="log path (default logs/<name>-<stamp>.jsonl)")
    r.add_argument("--turns", type=int, help="override max_turns")
    r.add_argument("--seconds", type=int, help="override max_seconds")
    r.set_defaults(fn=cmd_run)

    a = sub.add_parser("analyze", help="score a log and judge it")
    a.add_argument("log")
    a.add_argument("--top", type=int, default=8)
    a.add_argument("--no-judge", action="store_true", help="heuristics only, no API call")
    a.add_argument("--judge-model", default=os.environ.get("CHATCHAT_JUDGE", "anthropic/claude-sonnet-5"))
    a.add_argument("--max-chars", type=int, default=120_000)
    a.set_defaults(fn=cmd_analyze)

    m = sub.add_parser("models", help="list OpenRouter model ids")
    m.add_argument("-q", help="substring filter")
    m.add_argument("--limit", type=int, default=40)
    m.set_defaults(fn=cmd_models)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
