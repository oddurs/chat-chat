/** Assets are served under the Pages base path in production and at the root locally. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const asset = (p: string) => `${BASE}${p}`;
