/**
 * The path the site is published under.
 *
 * Specs navigate with paths relative to Playwright's `baseURL`, which already
 * includes this. But hrefs *in the DOM* are absolute, so anything asserting on
 * one has to say so — `url("/releases")` rather than `"/releases"`.
 */
export const BASE = "/goat-test";

/** A root-relative URL as it appears in the built markup. */
export function url(path: string): string {
	return path === "/" ? `${BASE}/` : `${BASE}${path}`;
}

/** The same, escaped for use inside a regular expression. */
export function urlPattern(path: string): string {
	return url(path).replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
}
