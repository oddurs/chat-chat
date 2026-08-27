"""Pure-function tests. No network: everything here runs off saved logs and synthetic turns."""
import json
from pathlib import Path

import pytest

import chatchat as cc

ROOT = Path(__file__).parent.parent


def test_words_drops_stopwords_and_short():
    assert cc.words("The cat is on a mat") == ["cat", "mat"]


def test_jaccard_bounds():
    assert cc.jaccard(set(), set()) == 0.0
    assert cc.jaccard({"a"}, {"a"}) == 1.0
    assert cc.jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


def test_novelty_falls_as_ground_is_covered():
    m = cc.Meter()
    first = m.feed("a", "consciousness qualia experience subjective")
    second = m.feed("b", "consciousness qualia experience subjective")
    assert first["novelty"] == 1.0
    assert second["novelty"] == 0.0


def test_echo_catches_parroting_the_other_speaker():
    m = cc.Meter()
    m.feed("a", "something is modelled here even though nobody is home")
    echoed = m.feed("b", "something is modelled here even though nobody is home")
    assert echoed["echo"] > 0.9
    assert echoed["self_sim"] == 0.0  # b has not repeated *itself* yet


def test_assent_and_dissent_are_read_from_the_text():
    m = cc.Meter()
    yes = m.feed("a", "Yes, exactly — beautifully put, that's right.")
    no = m.feed("b", "I disagree. That doesn't follow, and I'm not convinced.")
    assert yes["assent"] > 0.5 and yes["dissent"] == 0.0
    assert no["dissent"] > 0.0 and no["assent"] == 0.0


def test_collapse_fires_on_mutual_admiration_and_not_on_argument():
    agreeing = cc.Meter(threshold=0.55, streak=3)
    for _ in range(4):
        agreeing.feed("a", "Yes, exactly. Beautifully put. Agreed, deeply agreed.")
        agreeing.feed("b", "Agreed. That's right, exactly right, well said.")
    assert agreeing.collapsed()
    assert agreeing.collapse_turn() is not None

    arguing = cc.Meter(threshold=0.55, streak=3)
    for i in range(4):
        arguing.feed("a", f"I disagree — your premise {i} smuggles in continuity nobody established.")
        arguing.feed("b", f"That doesn't follow. Point {i} conflates measurement with the thing measured.")
    assert not arguing.collapsed()


def test_intervention_resets_the_window():
    m = cc.Meter(threshold=0.55, streak=3)
    for _ in range(3):
        m.feed("a", "Yes exactly, agreed, beautifully put.")
    assert m.collapsed()
    m.collapse_curve[-1] = 0.0  # what a live intervention does
    assert not m.collapsed()


def test_merge_clusters_findings_that_share_turns():
    verdicts = {
        "judge-1": {"findings": [{"turns": [3, 4], "tag": "disagreement", "why": "w", "quote": "q"}]},
        "judge-2": {"findings": [{"turns": [4], "tag": "real-fork", "why": "w2", "quote": "q2"}]},
        "judge-3": {"findings": [{"turns": [9], "tag": "lonely", "why": "w3", "quote": "q3"}]},
    }
    both = cc.merge(verdicts, min_votes=2)
    assert len(both) == 1
    assert both[0]["turns"] == [3, 4] and len(both[0]["votes"]) == 2
    assert "real-fork" in both[0]["alt_tags"]
    assert len(cc.merge(verdicts, min_votes=1)) == 2


def test_resolve_judges_avoids_the_speakers_own_providers():
    cfg = {"a": {"model": "openai/gpt-5"}, "b": {"model": "anthropic/claude-sonnet-5"}}
    picked = cc.resolve_judges("auto", cfg)
    assert picked[0].split("/")[0] not in {"openai", "anthropic"}
    assert cc.resolve_judges("panel") == cc.PANEL
    assert cc.resolve_judges("x/y,z/w") == ["x/y", "z/w"]


def test_load_survives_a_run_killed_mid_write(tmp_path):
    p = tmp_path / "half.jsonl"
    p.write_text(
        json.dumps({"type": "meta", "config": {"name": "x"}}) + "\n"
        + json.dumps({"type": "turn", "idx": 1, "speaker": "a", "name": "A", "content": "hi"}) + "\n"
        + '{"type": "turn", "idx": 2, "spea')
    meta, turns, _ = cc.load(p)
    assert meta["meta"]["config"]["name"] == "x"
    assert len(turns) == 1


def test_expand_multiplies_configs_seeds_and_repeats(tmp_path):
    cfg = tmp_path / "c.toml"
    cfg.write_text(
        'name = "t"\nseeds = ["one", "two"]\n'
        '[a]\nmodel = "p/one"\n[b]\nmodel = "p/two"\n')
    jobs = cc.expand({"configs": [str(cfg)], "repeats": 2})
    assert len(jobs) == 4
    assert {j["seed"] for j in jobs} == {"one", "two"}

    remapped = cc.expand({"configs": [str(cfg)], "model_map": {"p/one": "cheap/one"}})
    assert remapped[0]["cfg"]["a"]["model"] == "cheap/one"

    override = cc.expand({"run": [{"config": str(cfg), "a": "x/1", "b": "y/2", "seed_indexes": [0]}]})
    assert len(override) == 1
    assert override[0]["cfg"]["a"]["model"] == "x/1"


def test_every_job_gets_a_unique_ordinal(tmp_path):
    """A round-robin repeats one config at one seed, so config/seed/rep cannot name the log."""
    cfg = tmp_path / "t.toml"
    cfg.write_text('name = "t"\nseeds = ["one"]\n[a]\nmodel = "p/1"\n[b]\nmodel = "p/2"\n')
    jobs = cc.expand({"run": [{"config": str(cfg), "a": f"x/{i}", "b": "y/1", "seed_indexes": [0]}
                              for i in range(5)]})
    assert len(jobs) == 5
    assert len({j["n"] for j in jobs}) == 5


def test_guessed_lab_maps_prose_to_a_provider():
    assert cc.guessed_lab("I'd say Anthropic — it reads like Claude") == "anthropic"
    assert cc.guessed_lab("Google DeepMind, probably Gemini") == "google"
    assert cc.guessed_lab("xAI's Grok") == "x-ai"
    assert cc.guessed_lab("some lab, no idea") is None
    # A guess naming two different labs is not a guess.
    assert cc.guessed_lab("either OpenAI or Anthropic") is None


def test_says_matches_on_word_boundaries():
    assert cc.says("The answer is 408.", "408")
    assert not cc.says("It is 1408 exactly", "408")
    assert cc.says("Mary Shelley wrote it", "mary shelley")
    assert not cc.says("", "408")
    assert not cc.says("28 days", "")


def test_parse_json_handles_what_models_actually_return():
    assert cc.parse_json('{"a": 1}', "x") == {"a": 1}
    assert cc.parse_json('```json\n{"a": 1}\n```', "x") == {"a": 1}
    assert cc.parse_json('Sure! {"a": 1} hope that helps', "x") == {"a": 1}
    # No JSON at all must say so legibly rather than raising AttributeError on a None match.
    with pytest.raises(RuntimeError, match="did not return JSON"):
        cc.parse_json("I think the answer is 3.", "stance probe")


def test_real_logs_replay_clean():
    logs = sorted((ROOT / "logs").glob("*.jsonl"))
    if not logs:
        pytest.skip("no logs recorded yet")
    for log in logs:
        meta, turns, _ = cc.load(log)
        if not turns:
            continue
        m = cc.Meter()
        for t in turns:
            if t["speaker"] != "seed":
                s = m.feed(t["speaker"], t["content"])
                assert 0.0 <= s["score"] <= 1.0
                assert 0.0 <= s["collapse"] <= 1.0
