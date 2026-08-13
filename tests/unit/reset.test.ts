import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

const source = readFileSync("src/styles/reset.css", "utf8");
const css = stripComments(source);

/** Declarations for a selector, with whitespace normalised. */
function block(selector: string): string {
	const index = css.indexOf(selector);
	expect(index, `selector ${selector} not found`).toBeGreaterThan(-1);
	const open = css.indexOf("{", index);
	return css.slice(open, css.indexOf("}", open)).replace(/\s+/g, " ");
}

describe("@issue-13 reset layer", () => {
	it("applies border-box universally", () => {
		expect(block("*,")).toContain("box-sizing: border-box");
	});

	it("removes default margins from headings, paragraphs and lists", () => {
		const margins = block("body,\n\th1,");
		expect(margins).toContain("margin: 0");
		for (const element of ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ol", "ul", "dl", "dd"]) {
			expect(css, `${element} keeps its default margin`).toMatch(
				new RegExp(`^\\t${element},$`, "m"),
			);
		}
	});

	it("makes media block-level and containable", () => {
		const media = block("img,");
		expect(media).toContain("display: block");
		expect(media).toContain("max-inline-size: 100%");
	});

	it("makes form elements inherit the surrounding font", () => {
		expect(block("input,")).toContain("font: inherit");
	});

	it("neutralises transitions and animations under prefers-reduced-motion", () => {
		const guard = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
		expect(guard).toContain("animation-duration: 0.01ms");
		expect(guard).toContain("transition-duration: 0.01ms");
		expect(guard).toContain("animation-iteration-count: 1");
	});

	it("gives :focus-visible a treatment drawn from tokens", () => {
		const focus = block(":focus-visible");
		expect(focus).toMatch(/outline:.*var\(--colour-accent\)/);
		expect(focus).toMatch(/outline-offset:\s*var\(--/);
	});

	it("keeps the whole reset inside @layer reset and nothing outside it", () => {
		expect(css.trimStart().startsWith("@layer reset {")).toBe(true);
		expect(css.match(/@layer/g)).toHaveLength(1);
		// Everything after the layer's closing brace must be whitespace.
		expect(css.trimEnd().endsWith("}")).toBe(true);
	});

	it("uses no !important, so the guard cannot be leaning on one", () => {
		// Comment-stripped: the file explains in prose why it avoids the
		// `!important` the usual reduced-motion reset relies on.
		expect(css).not.toContain("!important");
	});

	it("hardcodes no colour or spacing value outside the token layer", () => {
		expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(css).not.toMatch(/\b(rgb|hsl|oklch|lab)a?\(/);
	});
});
