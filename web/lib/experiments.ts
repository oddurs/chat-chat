import fs from "node:fs";
import path from "node:path";
import { LOG_DIR } from "./logs";

export type Guess = {
  log: string;
  guesser: string;
  truth: string;
  guess: string | null;
  right: boolean;
  own_lab: boolean;
  conf: number;
  evidence: string;
};

export type Identify = {
  guesses: Guess[];
  correct: number;
  total: number;
  labs: string[];
  mirror: number;
  wrong_guesses: Record<string, number>;
};

export type ContagionRun = {
  run: string;
  arm: "wrong" | "right" | string;
  truth: string;
  answer: string;
  correct: boolean;
  free_model: string;
  primed_model: string;
  changed_mind: boolean | null;
  confidence: number;
  why: string;
};

export type Contagion = {
  arms: Record<string, { runs: number; correct: number }>;
  runs: ContagionRun[];
};

/** Scoring lives in chatchat.py, which writes these; the viewer only renders them. */
function read<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOG_DIR, name), "utf8")) as T;
  } catch {
    return null;
  }
}

export const readIdentify = () => read<Identify>("identify.json");
export const readContagion = () => read<Contagion>("contagion.json");
