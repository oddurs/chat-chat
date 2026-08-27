import { configNames, modelStats, pairStats } from "@/lib/stats";
import { ModelsView, type Scope } from "@/components/models-view";

const CONTROLLED = "table";

export default function Models() {
  // Every scope is computed at build time; the page only switches between them.
  const names = [CONTROLLED, "all", ...configNames().filter((c) => c !== CONTROLLED)];
  const scopes: Record<string, Scope> = {};
  for (const name of names) {
    const config = name === "all" ? undefined : name;
    scopes[name] = { stats: modelStats(config), pairs: pairStats(config) };
  }
  return <ModelsView scopes={scopes} />;
}
