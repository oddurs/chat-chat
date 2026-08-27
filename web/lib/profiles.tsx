import type { ReactNode } from "react";

type Provider = { label: string; color: string; mark: ReactNode };

// Abstract marks, not brand logos — enough to tell two speakers apart at a glance.
const PROVIDERS: Record<string, Provider> = {
  anthropic: {
    label: "Anthropic",
    color: "#d97757",
    mark: (
      <g strokeLinecap="round">
        {[0, 45, 90, 135].map((a) => (
          <line key={a} x1="12" y1="4.5" x2="12" y2="19.5" transform={`rotate(${a} 12 12)`} />
        ))}
      </g>
    ),
  },
  openai: {
    label: "OpenAI",
    color: "#10a37f",
    mark: (
      <g>
        <path d="M12 3.2 20 7.8v9.2L12 21.6 4 17V7.8z" />
        <circle cx="12" cy="12" r="3.1" />
      </g>
    ),
  },
  google: {
    label: "Google",
    color: "#4285f4",
    mark: <path d="M12 2.6c0 5.2 3.6 9 9.4 9.4-5.8.4-9.4 4.2-9.4 9.4 0-5.2-3.6-9-9.4-9.4 5.8-.4 9.4-4.2 9.4-9.4z" />,
  },
  "meta-llama": {
    label: "Meta",
    color: "#0668e1",
    mark: (
      <g>
        <circle cx="8" cy="12" r="5.2" />
        <circle cx="16" cy="12" r="5.2" />
      </g>
    ),
  },
  deepseek: {
    label: "DeepSeek",
    color: "#4d6bfe",
    mark: (
      <g>
        <circle cx="12" cy="12" r="3.4" />
        <ellipse cx="12" cy="12" rx="9" ry="4.4" transform="rotate(-28 12 12)" />
      </g>
    ),
  },
  "x-ai": {
    label: "xAI",
    color: "#a3a3ad",
    mark: (
      <g strokeLinecap="round">
        <line x1="5" y1="19" x2="19" y2="5" />
        <line x1="9.5" y1="19" x2="19" y2="9.5" />
      </g>
    ),
  },
  qwen: {
    label: "Qwen",
    color: "#615ced",
    mark: <path d="M12 3.4 20 8v8L12 20.6 4 16V8z" />,
  },
  mistralai: {
    label: "Mistral",
    color: "#ff7000",
    mark: (
      <g strokeLinecap="round">
        <line x1="5" y1="8" x2="19" y2="8" />
        <line x1="5" y1="12" x2="19" y2="12" />
        <line x1="9" y1="16" x2="19" y2="16" />
      </g>
    ),
  },
};

const FALLBACK: Provider = {
  label: "Model",
  color: "#7c8290",
  mark: <circle cx="12" cy="12" r="6.5" />,
};

const WORDS: Record<string, string> = { gpt: "GPT", ai: "AI", o1: "o1", v3: "v3", r1: "R1" };

export function modelProfile(id: string | null) {
  if (!id) return { provider: FALLBACK, providerKey: "", name: "Seed", id: "" };
  const [key, rest = ""] = id.split("/");
  const provider = PROVIDERS[key] ?? FALLBACK;
  const name = rest
    .replace(/:batch$/, "")
    .split("-")
    .map((w) => WORDS[w] ?? (/^[\d.]+$/.test(w) ? w : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ");
  return { provider, providerKey: key, name, id };
}

/** The speaker's provider colour, used to tint their side of the transcript. */
export function providerColor(model: string | null): string {
  return modelProfile(model).provider.color;
}

export function Avatar({ model, size = 34 }: { model: string | null; size?: number }) {
  const { provider } = modelProfile(model);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${provider.color} 16%, transparent)`,
        borderColor: `color-mix(in oklab, ${provider.color} 38%, transparent)`,
      }}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        stroke={provider.color}
        strokeWidth={1.7}
      >
        {provider.mark}
      </svg>
    </span>
  );
}
