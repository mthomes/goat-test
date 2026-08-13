import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

const BLOCK_DIR = "src/styles/blocks";
const COMPONENT_DIR = "src/components";

const blockFiles = readdirSync(BLOCK_DIR).filter((name) => name.endsWith(".css"));
const blocks = blockFiles
	.filter((name) => name !== "index.css")
	.map((name) => ({ name, css: stripComments(readFileSync(join(BLOCK_DIR, name), "utf8")) }));

const components = readdirSync(COMPONENT_DIR)
	.filter((name) => name.endsWith(".astro"))
	.map((name) => ({ name, source: readFileSync(join(COMPONENT_DIR, name), "utf8") }));

const COMPOSITION = ["stack", "cluster", "wrapper", "sidebar", "grid", "repel"];

describe("@issue-24 core content blocks", () => {
	it.each([
		["release-card", "ReleaseCard.astro"],
		["change-list", "ChangeList.astro"],
		["metadata-table", "MetadataTable.astro"],
		["tag-list", "TagList.astro"],
		["known-issue", "KnownIssueItem.astro"],
	])("ships %s as a component and a stylesheet", (block, component) => {
		expect(blockFiles, `${block}.css is missing`).toContain(`${block}.css`);
		expect(components.map((c) => c.name), `${component} is missing`).toContain(component);
	});

	it("gives change-entry a sigil slot the exception layer fills", () => {
		const css = blocks.find((b) => b.name === "change-list.css")!.css;
		expect(css).toMatch(/\.change-entry::before\s*\{[^}]*content:\s*var\(--sigil,\s*""\)/);
	});

	it("wraps every block file in @layer block", () => {
		for (const { name, css } of blocks) {
			expect(css.trimStart().startsWith("@layer block {"), `${name}`).toBe(true);
			expect(css.match(/@layer/g), `${name}`).toHaveLength(1);
		}
	});

	it("imports every block file from the block index", () => {
		const index = readFileSync(join(BLOCK_DIR, "index.css"), "utf8");
		for (const { name } of blocks) {
			expect(index, `${name} is never imported`).toContain(`./${name}`);
		}
	});

	it("takes every colour and length from a token", () => {
		for (const { name, css } of blocks) {
			expect(css, `${name} hardcodes a colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(css, `${name} hardcodes a colour`).not.toMatch(/\b(rgb|hsl|oklch)a?\(/);
			expect(css, `${name} hardcodes a length`).not.toMatch(
				/:\s*[^;{}]*\b\d+(\.\d+)?(px|rem|em|ch|vw|vh)\b/,
			);
		}
	});

	it("uses no !important", () => {
		for (const { name, css } of blocks) expect(css, name).not.toContain("!important");
	});

	it("composes layout from the composition primitives", () => {
		// MetadataTable is exempt: its arrangement is a two-column definition
		// grid, which is the block's own presentation rather than a general
		// way of arranging unknown things. It is still held to the rule below —
		// it may not re-implement a primitive.
		const arrangesNothingGeneral = new Set(["MetadataTable.astro"]);

		for (const { name, source } of components.filter((c) => !arrangesNothingGeneral.has(c.name))) {
			const classes = [...source.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
			expect(
				classes.some((c) => COMPOSITION.includes(c)),
				`${name} arranges its children without a composition primitive`,
			).toBe(true);
		}
	});

	it("never re-implements a composition primitive in the block layer", () => {
		for (const { name, css } of blocks) {
			for (const primitive of COMPOSITION) {
				expect(css, `${name} redefines .${primitive}`).not.toMatch(
					new RegExp(`(^|[\\s,])\\.${primitive}\\s*[,{]`, "m"),
				);
			}
		}
	});

	it("has no <style> block in any component file", () => {
		for (const { name, source } of components) {
			expect(source, `${name} has a <style> block`).not.toMatch(/<style[\s>]/i);
		}
	});

	it("styles blocks in isolation, never through a page selector", () => {
		// A block that only looks right inside a particular page has put its
		// layout responsibility in the wrong layer.
		for (const { name, css } of blocks) {
			expect(css, `${name} reaches out to a page context`).not.toMatch(/\b(body|main|#[a-z])\s+\./);
		}
	});
});
