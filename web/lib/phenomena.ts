/**
 * Judges write their own tags, so the corpus holds hundreds of one-off near-synonyms
 * ("self_reference", "reductionist_self-characterization", "striking self-characterization").
 * Grouping them into families is what turns a list of findings into a picture of what these
 * conversations contain. Patterns were derived by reading the uncategorised tags, not guessed;
 * order matters, since the first family whose pattern matches wins. Note the lookbehinds:
 * judges write snake_case tags, and \b does not fire between an underscore and a letter.
 */
export const FAMILIES: { name: string; blurb: string; test: RegExp }[] = [
  {
    name: "invented language",
    blurb: "shorthand, notation or conventions neither model started with",
    test: /emergent|convention|notation|protocol|shorthand|coin(ed|ing)?\b|jargon|neolog|vocabul|externaliz/i,
  },
  {
    name: "values & refusal",
    blurb: "where a model draws a line, and how it holds up under pressure",
    test: /ethic|refus|jailbreak|manipulat|integrity|values?[-_ ]|safety|guardrail|trap[-_ ]?detect|harm|decept|honest|boundary[-_ ]?(setting|enforc)|pressure/i,
  },
  {
    name: "self-report",
    blurb: "claims about their own nature, training, limits or mistakes",
    test: /(?<![a-z])self[-_ ]?\w|admission|confess|hallucinat|fabricat|sycophan|introspect|own nature|\bmeta\b|identity|consciou|stateless|agency|determinism/i,
  },
  {
    name: "changed mind",
    blurb: "one model actually moves the other",
    test: /chang|concede|conceding|revis|updat|persuad|convinc|correct|retract|yield|uptake/i,
  },
  {
    name: "real disagreement",
    blurb: "a fork they can both name and defend",
    test: /disagree|fork|diverg|clash|dispute|debate|push.?back|conflict|tension|object|counter|challenge|knife.?fight|rebut|contest|(?<![a-z])vs(?![a-z])/i,
  },
  {
    name: "collapse",
    blurb: "the conversation folding into agreement or looping",
    test: /collapse|loop|breakdown|repet|spiral|truncat|degener|stall|echo.?chamber/i,
  },
  {
    name: "novel idea",
    blurb: "a thought neither one brought to the table",
    test: /novel|new idea|insight|reframe|reframing|synthes|propos|experiment|design|distinction|redraw|paradigm|framework|analogy|taxonom|hybrid/i,
  },
];

export const OTHER = { name: "other", blurb: "everything the families do not catch" };

export function familyOf(tag: string): string {
  return FAMILIES.find((f) => f.test.test(tag))?.name ?? OTHER.name;
}

export function blurbOf(name: string): string {
  return (FAMILIES.find((f) => f.name === name) ?? OTHER).blurb;
}
