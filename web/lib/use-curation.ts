"use client";

import { useSyncExternalStore } from "react";
import { serverSnapshot, snapshot, subscribe, type CurationFile } from "./curation";

/** The curation store, read the way React wants an external store read. */
export function useCuration(): CurationFile {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
