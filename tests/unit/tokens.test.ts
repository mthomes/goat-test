import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { colourTokens, contrast, stripComments } from "../helpers/colour.ts";

const css = stripComments(readFileSync("src/styles/tokens.css", "utf8"));

/** Every combination the site can actually put text on. */
export const GROUNDS = ["--colour-paper", "--colour-paper-inset"] as const;
export const TEXTS = ["--colour-ink", "--colour-ink-muted", "--colour-accent"] as const;

describe("@issue-12 token layer", () => {
	const tokens = colourTokens("root");

	it("defines the paper palette: cream ground, ink text, oxblood accent, muted tones", () => {
		for (const name of [...GROUNDS, ...TEXTS, "--colour-rule", "--colour-rule-strong"]) {
			expect(tokens[name], `${name} is not defined`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it.each(
		GROUNDS.flatMap((ground) => TEXTS.map((text) => [text, ground] as const)),
	)("clears WCAG AA: %s on %s", (text, ground) => {
		expect(contrast(tokens[text], tokens[ground])).toBeGreaterThanOrEqual(4.5);
	});

	it("keeps the strong rule tone usable as a meaningful boundary at 3:1", () => {
		expect(contrast(tokens["--colour-rule-strong"], tokens["--colour-paper"]))
			.toBeGreaterThanOrEqual(3);
	});

	it("provides a clamp()-based fluid type scale from -1 through 6", () => {
		for (const step of ["down-1", "0", "1", "2", "3", "4", "5", "6"]) {
			expect(css, `--step-${step} is missing`).toMatch(
				new RegExp(`--step-${step}:\\s*clamp\\(`),
			);
		}
	});

	it("provides a clamp()-based fluid space scale with one-up pairs", () => {
		for (const size of ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"]) {
			expect(css, `--space-${size} is missing`).toMatch(
				new RegExp(`--space-${size}:\\s*clamp\\(`),
			);
		}
		for (const pair of ["3xs-2xs", "2xs-xs", "xs-s", "s-m", "m-l", "l-xl", "xl-2xl", "2xl-3xl"]) {
			expect(css, `--space-${pair} is missing`).toMatch(
				new RegExp(`--space-${pair}:\\s*clamp\\(`),
			);
		}
	});

	it("names a flow-space default with the rung above and below it", () => {
		for (const name of ["--flow-space-tight", "--flow-space", "--flow-space-loose"]) {
			expect(css, `${name} is missing`).toContain(`${name}:`);
		}
	});

	it("defines measure, rule-weight, border-width and family tokens", () => {
		for (const name of [
			"--measure", "--measure-narrow",
			"--rule-hairline", "--rule-medium", "--rule-heavy",
			"--border-width", "--font-serif", "--font-mono",
		]) {
			expect(css, `${name} is missing`).toContain(`${name}:`);
		}
	});

	it("keeps every token inside @layer tokens", () => {
		const layerBody = css.slice(css.indexOf("@layer tokens {"));
		for (const [, name] of css.matchAll(/^\t*(--[a-z0-9-]+):/gm)) {
			expect(layerBody).toContain(`${name}:`);
		}
		expect(css.match(/@layer/g)).toHaveLength(1);
	});

	it("names every custom property in kebab-case", () => {
		for (const [, name] of css.matchAll(/(--[a-zA-Z0-9_-]+):/g)) {
			expect(name, `${name} is not kebab-case`).toMatch(/^--[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
		}
	});
});

describe("@issue-17 dark carbon-copy palette", () => {
	const light = colourTokens("root");
	const dark = colourTokens("dark");

	it("redefines values without adding or renaming a single token", () => {
		expect(Object.keys(dark).length).toBeGreaterThan(0);
		for (const name of Object.keys(dark)) {
			expect(light, `${name} is dark-only — token names must not change`).toHaveProperty(name);
		}
	});

	it.each(
		GROUNDS.flatMap((ground) => TEXTS.map((text) => [text, ground] as const)),
	)("clears WCAG AA in dark: %s on %s", (text, ground) => {
		expect(contrast(dark[text], dark[ground])).toBeGreaterThanOrEqual(4.5);
	});

	it("keeps the strong rule tone at 3:1 in dark too", () => {
		expect(contrast(dark["--colour-rule-strong"], dark["--colour-paper"]))
			.toBeGreaterThanOrEqual(3);
	});

	it("reads as a carbon copy, not an inversion of the light palette", () => {
		const channels = (hex: string) =>
			hex.replace("#", "").match(/../g)!.map((pair) => parseInt(pair, 16));

		const hue = (hex: string) => {
			const [r, g, b] = channels(hex).map((c) => c / 255);
			return ((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI + 360) % 360;
		};
		const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

		// The tell of a naive inversion is the accent: 255 minus oxblood is a
		// mint green. A carbon copy keeps the pigment and changes the paper.
		const invertedAccent = `#${channels(light["--colour-accent"])
			.map((c) => (255 - c).toString(16).padStart(2, "0")).join("")}`;
		expect(hueGap(hue(light["--colour-accent"]), hue(dark["--colour-accent"]))).toBeLessThan(30);
		expect(hueGap(hue(light["--colour-accent"]), hue(invertedAccent))).toBeGreaterThan(120);

		// Cream is warm (red channel highest); the carbon ground is cool
		// (blue channel highest). That reversal is the palette, not a tint.
		const [lr, , lb] = channels(light["--colour-paper"]);
		const [dr, , db] = channels(dark["--colour-paper"]);
		expect(lr).toBeGreaterThan(lb);
		expect(db).toBeGreaterThan(dr);

		// A carbon flimsy is an impression on stock, not a void. Nothing is
		// pure black or pure white, and the ground is lifted clear of zero.
		expect(dark["--colour-paper"]).not.toBe("#000000");
		expect(dark["--colour-ink"]).not.toBe("#ffffff");
		expect(Math.min(...channels(dark["--colour-paper"]))).toBeGreaterThan(8);
		expect(Math.max(...channels(dark["--colour-ink"]))).toBeLessThan(245);
	});

	it("re-tunes the accent rather than reusing it verbatim", () => {
		expect(dark["--colour-accent"]).not.toBe(light["--colour-accent"]);
		// Light-mode oxblood on the carbon ground would be all but invisible.
		expect(contrast(light["--colour-accent"], dark["--colour-paper"])).toBeLessThan(3);
		expect(contrast(dark["--colour-accent"], dark["--colour-paper"])).toBeGreaterThanOrEqual(4.5);
	});

	it("re-weights rules and borders for the dark ground", () => {
		// Rules are dimmed relative to their ground: light-on-dark edges bloom,
		// so a hairline tuned for cream is too loud here.
		expect(contrast(dark["--colour-rule"], dark["--colour-paper"]))
			.toBeLessThan(contrast(light["--colour-rule"], light["--colour-paper"]));

		// And the heavy rule drops a weight — 3px of near-white is a bar.
		const darkBlock = stripComments(readFileSync("src/styles/tokens.css", "utf8"))
			.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
		expect(darkBlock).toContain("--rule-heavy: var(--rule-medium)");
	});

	it("involves no JavaScript at all", () => {
		expect(css).not.toMatch(/\bscript\b/i);
		expect(css).toContain("@media (prefers-color-scheme: dark)");
	});
});
