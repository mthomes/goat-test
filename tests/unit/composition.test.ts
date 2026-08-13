import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

const css = stripComments(readFileSync("src/styles/composition.css", "utf8"));

describe("@issue-14 composition primitives", () => {
	it.each(["stack", "cluster", "wrapper", "sidebar", "grid", "repel"])(
		"defines .%s",
		(primitive) => {
			expect(css).toMatch(new RegExp(`\\.${primitive}[\\s,{>:]`));
		},
	);

	it("spaces a stack with the lobotomised owl, driven by --flow-space", () => {
		expect(css).toMatch(/\.stack > \* \+ \*\s*\{[^}]*margin-block-start:\s*var\(--flow-space\)/);
	});

	it("collapses the sidebar without a media query", () => {
		expect(css).not.toContain("@media");
		expect(css).toMatch(/\.sidebar > :last-child\s*\{[^}]*flex-grow:\s*999/);
	});

	it("gives the grid a minimum track size that cannot overflow the viewport", () => {
		expect(css).toMatch(/minmax\(\s*min\(var\(--grid-min[^)]*\)[^)]*\),\s*100%\)/);
	});

	it("stays layout-only: no colour", () => {
		expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(css).not.toMatch(/\b(rgb|hsl|oklch|lab)a?\(/);
		expect(css).not.toMatch(/(^|[\s;{])(color|background|background-color|fill):/);
	});

	it("stays layout-only: no typography", () => {
		expect(css).not.toMatch(/(^|[\s;{])(font|font-family|font-size|font-weight|line-height|letter-spacing|text-transform):/);
	});

	it("stays layout-only: no borders", () => {
		expect(css).not.toMatch(/(^|[\s;{])(border|border-[a-z-]*|box-shadow|outline):/);
	});

	it("takes every length from a token", () => {
		// Every length-valued declaration resolves through a custom property.
		// Bare ratios (flex-grow: 999, min-inline-size: 60%) are intrinsic to
		// the technique rather than design decisions, so they are exempt.
		const lengths = css.match(/:\s*[^;{}]*\b\d+(\.\d+)?(px|rem|em|ch|vw|vh)\b/g) ?? [];
		expect(lengths).toEqual([]);
	});

	it("keeps everything inside @layer composition", () => {
		expect(css.trimStart().startsWith("@layer composition {")).toBe(true);
		expect(css.match(/@layer/g)).toHaveLength(1);
	});
});
