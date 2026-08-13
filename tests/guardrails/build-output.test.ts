import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { stripComments } from "../helpers/colour.ts";

/**
 * The project's two defining constraints, turned into tests that fail loudly.
 *
 * Everything here reads **build output**, not source. Source-level checks are
 * useful (`npm run lint:style-blocks`, Stylelint in #36) but they cannot see
 * what an integration, a bundler or a future dependency reintroduces on the
 * way to `dist/`. The zero-bytes-JS assertion in particular is only meaningful
 * against shipped code.
 *
 * Run with `npm run test:guardrails`, which builds first.
 */

const DIST = "dist";

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const built = walk(DIST);
const htmlFiles = built.filter((path) => path.endsWith(".html"));
const cssFiles = built.filter((path) => path.endsWith(".css"));
const css = cssFiles.map((path) => readFileSync(path, "utf8")).join("\n");

/**
 * Every rule prelude in the sheet — the text immediately before a `{`.
 *
 * Walked rather than split on `}`: layer blocks nest, and a naive split hands
 * back `@layer block` for a rule inside one, which then looks like an at-rule
 * and gets skipped. That is how an id selector got past an earlier version of
 * this file.
 */
function preludes(source: string): string[] {
	const found: string[] = [];
	let buffer = "";

	for (const character of source) {
		if (character === "{") {
			found.push(buffer.trim());
			buffer = "";
		} else if (character === "}" || character === ";") {
			buffer = "";
		} else {
			buffer += character;
		}
	}

	return found.filter((prelude) => prelude.length > 0);
}

const selectors = preludes(css).filter((prelude) => !prelude.startsWith("@"));

/** `[property, value]` for every declaration in a slice of CSS. */
function declarations(source: string): [string, string][] {
	return [...source.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)]
		.map(([, property, value]) => [property, value.trim()] as [string, string]);
}

/**
 * Values that are colours but carry no design decision. Everything else in a
 * non-token layer has to resolve through a custom property.
 */
const COLOURLESS = new Set([
	"currentcolor", "transparent", "inherit", "initial", "unset", "revert", "none", "0",
]);

/**
 * Everything inside `@layer <name>{ … }`, across **every** block of that layer.
 *
 * The bundler emits one block per source file rather than merging them, so
 * reading only the first one silently checks a fraction of the layer — which
 * is exactly how a hardcoded colour got past an earlier version of this file.
 * Braces are matched rather than searched for, since layer bodies nest.
 */
function layerBody(name: string): string {
	const open = `@layer ${name}{`;
	const bodies: string[] = [];

	for (let at = css.indexOf(open); at !== -1; at = css.indexOf(open, at + 1)) {
		let depth = 1;
		let cursor = at + open.length;
		while (cursor < css.length && depth > 0) {
			if (css[cursor] === "{") depth += 1;
			else if (css[cursor] === "}") depth -= 1;
			cursor += 1;
		}
		bodies.push(css.slice(at + open.length, cursor - 1));
	}

	return bodies.join("\n");
}

describe("@issue-49 zero client-side JavaScript", () => {
	it("builds pages to assert against", () => {
		expect(htmlFiles.length).toBeGreaterThan(50);
		expect(cssFiles.length).toBeGreaterThan(0);
	});

	it("ships no <script> tag, with or without a src", () => {
		for (const path of htmlFiles) {
			const html = readFileSync(path, "utf8");
			expect(html, `${path} contains a <script>`).not.toMatch(/<script[\s>]/i);
		}
	});

	it("ships no hydration directive", () => {
		for (const path of htmlFiles) {
			const html = readFileSync(path, "utf8");
			for (const directive of ["client:load", "client:idle", "client:visible", "client:media", "client:only"]) {
				expect(html, `${path} contains ${directive}`).not.toContain(directive);
			}
			expect(html, `${path} contains astro-island`).not.toContain("astro-island");
		}
	});

	it("emits no JavaScript file at all", () => {
		const scripts = built.filter((path) => [".js", ".mjs", ".cjs"].includes(extname(path)));
		expect(scripts, `build output contains JavaScript: ${scripts.join(", ")}`).toEqual([]);
	});

	it("ships zero bytes of JavaScript, counted", () => {
		const bytes = built
			.filter((path) => [".js", ".mjs", ".cjs"].includes(extname(path)))
			.reduce((total, path) => total + statSync(path).size, 0);

		expect(bytes).toBe(0);
	});

	it("uses no inline event handlers", () => {
		for (const path of htmlFiles) {
			const html = readFileSync(path, "utf8");
			expect(html, `${path} has an inline handler`).not.toMatch(/\son[a-z]+\s*=/i);
			expect(html, `${path} has a javascript: URL`).not.toMatch(/href\s*=\s*["']javascript:/i);
		}
	});
});

describe("@issue-49 CUBE cascade integrity", () => {
	const CANONICAL = ["reset", "tokens", "composition", "utility", "block", "exception"];

	it("declares the canonical layer order, exactly, before anything else", () => {
		const statement = /@layer\s+([a-z,\s]+);/.exec(css);

		expect(statement, "no @layer statement in the built CSS").not.toBeNull();
		expect(statement![1].split(",").map((name) => name.trim())).toEqual(CANONICAL);
		// And it is the first thing in the sheet, so nothing lands ahead of it.
		expect(css.trimStart().startsWith("@layer")).toBe(true);
	});

	it("opens no layer the statement does not name", () => {
		// A layer block whose name is not in the statement would be appended to
		// the end of the order, silently winning over everything.
		const opened = [...css.matchAll(/@layer ([a-z]+)\{/g)].map((match) => match[1]);

		expect(opened.length).toBeGreaterThan(0);
		for (const name of opened) expect(CANONICAL, `unknown layer: ${name}`).toContain(name);

		// Blocks may repeat and interleave — the statement is what fixes the
		// order — but the first time each layer appears should still follow it.
		const firstAppearance = [...new Set(opened)];
		expect(firstAppearance).toEqual(CANONICAL.filter((name) => firstAppearance.includes(name)));
	});

	it("leaves no rule outside a layer", () => {
		// Everything after the layer statement must live inside a layer block.
		const afterStatement = css.slice(css.indexOf(";") + 1);
		const firstLayer = afterStatement.indexOf("@layer");
		expect(afterStatement.slice(0, firstLayer).trim()).toBe("");
	});

	it("contains no !important", () => {
		expect(css).not.toContain("!important");
	});

	it("contains no ID selector", () => {
		for (const selector of selectors) {
			expect(selector, `id selector: ${selector.trim()}`).not.toMatch(/#[a-zA-Z_-]/);
		}
	});

	it("keeps every literal colour inside the token layer", () => {
		const COLOUR_FUNCTION = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(/g;
		// Properties whose value is, or contains, a colour.
		const COLOUR_PROPERTY = /(^|-)color$|^background$|^border(-block|-inline)?(-start|-end)?$|^outline$|^fill$|^stroke$|^box-shadow$/;

		// Sanity: the extractor must actually see the whole layer. A block layer
		// this small would mean it is reading one file's worth and nothing else.
		expect(layerBody("block").length).toBeGreaterThan(2000);

		for (const name of CANONICAL.filter((layer) => layer !== "tokens")) {
			const body = layerBody(name);

			// Notation-based: hex and colour functions.
			const literal = body.match(COLOUR_FUNCTION) ?? [];
			expect(literal, `@layer ${name} hardcodes ${literal.join(", ")}`).toEqual([]);

			// Value-based, because a minifier rewrites `#ff0000` to `red` and a
			// notation check alone would wave that straight through.
			for (const [property, value] of declarations(body)) {
				if (!COLOUR_PROPERTY.test(property)) continue;
				if (value.includes("var(--")) continue;
				const words = value.split(/\s+/).filter((word) => !COLOURLESS.has(word.toLowerCase()));
				expect(words, `@layer ${name} sets ${property}: ${value} without a token`).toEqual([]);
			}
		}

		// And the token layer is where the literals all actually are.
		expect((layerBody("tokens").match(COLOUR_FUNCTION) ?? []).length).toBeGreaterThan(5);
	});

	it("defines every custom property it references without a fallback", () => {
		const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));

		// `var(--x, …)` is an optional knob by design — a block exposes it so an
		// exception *can* set it, and the fallback is what happens when nothing
		// does. Only unguarded references have to resolve.
		const unguarded = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)].map((match) => match[1]);

		const missing = [...new Set(unguarded)].filter((name) => !defined.has(name));
		expect(missing, `referenced but never defined: ${missing.join(", ")}`).toEqual([]);
	});

	it("defines every fallback-guarded property it falls back to", () => {
		const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
		const fallbacks = [...css.matchAll(/var\(\s*--[a-z0-9-]+\s*,\s*var\(\s*(--[a-z0-9-]+)\s*\)/g)]
			.map((match) => match[1]);

		const missing = [...new Set(fallbacks)].filter((name) => !defined.has(name));
		expect(missing, `fallback target undefined: ${missing.join(", ")}`).toEqual([]);
	});
});

describe("@issue-49 source-level constraints", () => {
	it("has no <style> block in any .astro file", () => {
		const astro = walk("src").filter((path) => path.endsWith(".astro"));

		expect(astro.length).toBeGreaterThan(0);
		for (const path of astro) {
			expect(readFileSync(path, "utf8"), `${path}`).not.toMatch(/<style[\s>]/i);
		}
	});

	it("imports the stylesheet exactly once, from the base layout", () => {
		const astro = walk("src").filter((path) => path.endsWith(".astro"));
		const importers = astro.filter((path) => readFileSync(path, "utf8").includes("styles/index.css"));

		expect(importers).toEqual(["src/layouts/BaseLayout.astro"]);
	});

	it("links exactly one stylesheet from every built page", () => {
		for (const path of htmlFiles) {
			const links = readFileSync(path, "utf8").match(/<link[^>]+rel="stylesheet"/g) ?? [];
			expect(links, `${path} links ${links.length} stylesheets`).toHaveLength(1);
		}
	});

	it("keeps the theme-color meta equal to the paper token in both schemes", () => {
		// A `theme-color` meta cannot read a custom property, so these are the
		// only colour values outside the token layer. This is what stops them
		// drifting away from the palette they are supposed to match.
		// Comments stripped: the file explains the dark-mode rule in prose,
		// and a naive search finds the sentence rather than the media query.
		const tokens = stripComments(readFileSync("src/styles/tokens.css", "utf8"));
		const light = /--colour-paper:\s*(#[0-9a-f]{6})/.exec(tokens)![1];
		const dark = /@media \(prefers-color-scheme: dark\)[\s\S]*?--colour-paper:\s*(#[0-9a-f]{6})/.exec(tokens)![1];

		const html = readFileSync(join(DIST, "index.html"), "utf8");
		const metas = [...html.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: (light|dark)\)">/g)];

		expect(Object.fromEntries(metas.map((m) => [m[2], m[1]]))).toEqual({ light, dark });
	});
});
