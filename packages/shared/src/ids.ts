import { ORDER_ID_PREFIX } from "./constants";

/**
 * Cross-platform id generator (Node 22 + browsers both expose globalThis.crypto).
 * Kept dependency-free so the shared package stays isomorphic.
 */
export const newOrderId = (): string =>
  `${ORDER_ID_PREFIX}_${globalThis.crypto.randomUUID()}`;

export const nowIso = (): string => new Date().toISOString();
