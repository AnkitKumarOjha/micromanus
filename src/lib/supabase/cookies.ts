// The exact CookieOptions type from @supabase/ssr isn't re-exported from the
// package root, and the two overlapping cookie-method shapes make the setAll
// callback param infer as implicit-any. We annotate with a permissive alias so
// the handler stays assignable under strictFunctionTypes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CookieOptions = any;

export interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}
