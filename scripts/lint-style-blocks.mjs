/**
 * Project rule: no `<style>` block in any `.astro` file, ever.
 *
 * CUBE CSS is fully global here. A component-scoped style block would sit
 * outside the `@layer` order declared in `src/styles/index.css`, and
 * unlayered styles beat every layered one regardless of specificity — one
 * `<style>` block is enough to make the whole cascade unpredictable.
 *
 * Astro's own build output may inline the global stylesheet into a `<style>`
 * tag; that is a build artefact, not authored source, so only `.astro`
 * sources under `src/` are scanned.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STYLE_TAG = /<style[\s>]/i;

function walk(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const offenders = walk("src")
	.filter((path) => path.endsWith(".astro"))
	.filter((path) => STYLE_TAG.test(readFileSync(path, "utf8")));

if (offenders.length > 0) {
	console.error("`<style>` blocks are not allowed in .astro files:");
	for (const path of offenders) console.error(`  ${path}`);
	process.exit(1);
}

console.log("No `<style>` blocks in .astro sources.");
