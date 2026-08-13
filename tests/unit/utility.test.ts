import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

const css = stripComments(readFileSync("src/styles/utility.css", "utf8"));

/** `[selector, body]` for every rule in the layer. */
const rules = [...css.matchAll(/(?:^|\n)\t(\.[^{]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
	selector: selector.trim(),
	declarations: body.split(";").map((d) => d.trim()).filter(Boolean),
}));

describe("@issue-15 utility layer", () => {
	it("controls line length", () => {
		expect(css).toMatch(/\.measure\s*\{[^}]*max-inline-size:\s*var\(--measure\)/);
		expect(css).toMatch(/\.measure-narrow\s*\{[^}]*max-inline-size:\s*var\(--measure-narrow\)/);
	});

	it("hides accessibly, and gives it back on focus", () => {
		// The `:not(:focus):not(:focus-within)` guard is the whole point: a
		// skip link hidden unconditionally is not a skip link.
		expect(css).toContain(".visually-hidden:not(:focus):not(:focus-within)");
		expect(css).toMatch(/clip-path:\s*inset\(50%\)/);
	});

	it("pads a region vertically, overridably", () => {
		expect(css).toMatch(/\.region\s*\{[^}]*padding-block:\s*var\(--region-space,\s*var\(--space-/);
	});

	it("overrides stack rhythm per instance for every rung of the scale", () => {
		for (const size of ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "tight", "loose"]) {
			expect(css, `.flow-space-${size} is missing`).toMatch(
				new RegExp(`\\.flow-space-${size}\\s*\\{\\s*--flow-space:`),
			);
		}
	});

	it("exposes every type step", () => {
		for (const step of ["down-1", "0", "1", "2", "3", "4", "5", "6"]) {
			expect(css, `.text-step-${step} is missing`).toMatch(
				new RegExp(`\\.text-step-${step}\\s*\\{\\s*font-size:\\s*var\\(--step-${step}\\)`),
			);
		}
	});

	it("exposes weight, small-caps and label letterspacing", () => {
		expect(css).toMatch(/\.text-regular\s*\{\s*font-weight:\s*var\(--font-weight-regular\)/);
		expect(css).toMatch(/\.text-bold\s*\{\s*font-weight:\s*var\(--font-weight-bold\)/);
		expect(css).toMatch(/\.text-small-caps\s*\{\s*font-variant-caps:\s*all-small-caps/);
		expect(css).toMatch(/\.tracking-label\s*\{\s*letter-spacing:\s*var\(--tracking-label\)/);
	});

	it("exposes ink, muted and accent text and paper and inset grounds", () => {
		expect(css).toMatch(/\.text-ink\s*\{\s*color:\s*var\(--colour-ink\)/);
		expect(css).toMatch(/\.text-muted\s*\{\s*color:\s*var\(--colour-ink-muted\)/);
		expect(css).toMatch(/\.text-accent\s*\{\s*color:\s*var\(--colour-accent\)/);
		expect(css).toMatch(/\.ground-paper\s*\{\s*background-color:\s*var\(--colour-paper\)/);
		expect(css).toMatch(/\.ground-inset\s*\{\s*background-color:\s*var\(--colour-paper-inset\)/);
	});

	it("contains no literal value anywhere — every utility consumes a token", () => {
		for (const { selector, declarations } of rules) {
			for (const declaration of declarations) {
				const value = declaration.slice(declaration.indexOf(":") + 1).trim();
				// `inset(50%)` and `all-small-caps` are keywords and technique
				// constants, not design decisions. Anything with a unit is not.
				expect(value, `${selector} { ${declaration} } is a literal`).not.toMatch(
					/\b\d+(\.\d+)?(px|rem|em|ch|vw|vh|pt)\b|#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl|oklch)a?\(/,
				);
			}
		}
		expect(rules.length).toBeGreaterThan(20);
	});

	it("keeps utilities single-property wherever the CSS allows", () => {
		const multi = rules.filter((rule) => rule.declarations.length > 1);
		// Only the visually-hidden technique needs more than one declaration.
		expect(multi.map((rule) => rule.selector)).toEqual([
			".visually-hidden:not(:focus):not(:focus-within)",
		]);
	});

	it("keeps everything inside @layer utility", () => {
		expect(css.trimStart().startsWith("@layer utility {")).toBe(true);
		expect(css.match(/@layer/g)).toHaveLength(1);
	});
});
