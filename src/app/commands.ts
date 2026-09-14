import type { ContentId } from "../domain/content/catalog";

/**
 * The narrow, serializable intent boundary the launch UI and game bridge
 * dispatch. It carries controlled player intent only; the application store
 * injects run identity, seed, clock, and commit metadata before invoking the
 * pure run reducer. This file imports no React or screen code and re-exports no
 * mutable state so M06/M08 can depend on it without a runtime cycle.
 */
export type AppCommand =
  | { readonly type: "home/select-class"; readonly classId: ContentId }
  | { readonly type: "run/request-start" }
  | { readonly type: "run/resume" }
  | { readonly type: "run/cancel-replacement" }
  | { readonly type: "run/confirm-abandon-and-start" }
  | { readonly type: "run/return-to-archive" }
  | { readonly type: "route/materialize" }
  | { readonly type: "route/select-offer"; readonly offerId: string }
  | { readonly type: "route/commit" };
