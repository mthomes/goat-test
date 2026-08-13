import { readFileSync } from "node:fs";

/** Relative luminance and contrast per WCAG 2.1, sRGB. */
export function luminance(hex: string): number {
	const channels = hex.replace("#", "").match(/../g);
	if (!channels || channels.length !== 3) throw new Error(`Not a 6-digit hex colour: ${hex}`);
	const [r, g, b] = channels
		.map((pair) => parseInt(pair, 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Strip CSS comments. The token file documents the dark-mode rule and the
 * layer name in prose, and a naive search finds the sentence about the media
 * query rather than the media query.
 */
export function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Pull `--colour-*` declarations out of the token stylesheet.
 *
 * `scope` selects which block to read: `"root"` for the base `:root` block,
 * `"dark"` for the one inside `@media (prefers-color-scheme: dark)`. Parsing
 * the source rather than a rendered page keeps this a fast unit test; the
 * rendered-page equivalents live in the E2E suite.
 */
export function colourTokens(scope: "root" | "dark" = "root"): Record<string, string> {
	const css = stripComments(readFileSync("src/styles/tokens.css", "utf8"));
	const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
	const region =
		scope === "root"
			? darkStart === -1
				? css
				: css.slice(0, darkStart)
			: darkStart === -1
				? ""
				: css.slice(darkStart);

	const tokens: Record<string, string> = {};
	for (const [, name, value] of region.matchAll(/(--colour-[a-z0-9-]+):\s*([^;]+);/g)) {
		tokens[name] = value.trim();
	}
	return tokens;
}
