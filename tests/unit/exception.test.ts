import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

const source = readFileSync("src/styles/exception.css", "utf8");
const css = stripComments(source);

const rules = [...css.matchAll(/(?:^|\n)\t([^{@\n][^{]*)\{([^}]*)\}/g)].map(([, selector, body]) => ({
	selector: selector.trim(),
	declarations: body.split(";").map((d) => d.trim()).filter(Boolean),
}));

describe("@issue-18 exception layer conventions", () => {
	it("expresses every exception as a data-* attribute, never a modifier class", () => {
		expect(rules.length).toBeGreaterThan(0);
		for (const { selector } of rules) {
			expect(selector, `${selector} is not a data-* selector`).toMatch(/^\[data-[a-z-]+(=|\])/);
			// No BEM-style modifiers anywhere in the layer.
			expect(selector).not.toMatch(/\.[a-z-]+--/);
		}
	});

	it("covers the known variants", () => {
		for (const selector of [
			'[data-release-type="major"]',
			'[data-change-type="added"]',
			'[data-state="resolved"]',
		]) {
			expect(css, `${selector} is missing`).toContain(selector);
		}
	});

	it("gives every change type its own sigil, and no two the same", () => {
		const sigils = [...css.matchAll(/\[data-change-type="([a-z-]+)"\]\s*\{\s*--sigil:\s*var\((--sigil-[a-z-]+)\)/g)];

		expect(sigils.map((m) => m[1]).sort()).toEqual(
			["added", "changed", "deprecated", "fixed", "known-issue", "removed"],
		);
		expect(new Set(sigils.map((m) => m[2])).size).toBe(6);
	});

	it("gives every release type a rule weight", () => {
		for (const type of ["major", "minor", "patch"]) {
			expect(css).toMatch(
				new RegExp(`\\[data-release-type="${type}"\\]\\s*\\{[^}]*--release-rule:`),
			);
		}
	});

	it("retunes block knobs rather than reaching inside a block", () => {
		// Almost everything here should be a custom property a block already
		// consumes. A descendant selector into a block's internals is the
		// shape of an exception that should have been a block.
		for (const { selector } of rules) {
			expect(selector, `${selector} reaches into a block`).not.toMatch(/\s\.[a-z]/);
		}

		const direct = rules.filter((rule) =>
			rule.declarations.some((declaration) => !declaration.startsWith("--")),
		);
		// One documented direct override, which is what makes the layer's
		// position in the order load-bearing rather than decorative.
		expect(direct.map((rule) => rule.selector)).toEqual(['[data-state="resolved"]']);
	});

	it("takes every value from a token", () => {
		for (const { selector, declarations } of rules) {
			for (const declaration of declarations) {
				const value = declaration.slice(declaration.indexOf(":") + 1).trim();
				expect(value, `${selector} { ${declaration} }`).toMatch(/^var\(--/);
			}
		}
	});

	it("uses no !important", () => {
		expect(css).not.toContain("!important");
	});

	it("keeps everything inside @layer exception", () => {
		expect(css.trimStart().startsWith("@layer exception {")).toBe(true);
		expect(css.match(/@layer/g)).toHaveLength(1);
	});

	it("writes down when an exception is legitimate and when it is a missing block", () => {
		// The ticket is mostly about the rule being written down; an
		// undocumented exception layer becomes a junk drawer.
		expect(source).toMatch(/When an exception is legitimate/i);
		expect(source).toMatch(/missing Block/i);
	});
});
