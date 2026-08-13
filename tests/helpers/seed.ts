import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import { releaseSchema, resetKnownIssueRegistry, type Release } from "../../src/content/schema.ts";

const DIR = "src/content/releases";

export interface SeedRelease extends Release {
	/** Filename stem, which is also the entry id Astro would give it. */
	readonly slug: string;
	/** Markdown body after the frontmatter, if any. */
	readonly body: string;
}

/**
 * Load the real seed corpus from disk and validate it through the real schema.
 *
 * Deliberately not via `astro:content`: the content layer's data store is
 * populated by a build, so reading it from a unit test would either need a
 * build first or silently return zero entries — which is exactly the shape of
 * a test that passes while proving nothing. The rendered-page path is covered
 * end to end by the E2E suite instead.
 */
export function loadSeedReleases(): SeedRelease[] {
	resetKnownIssueRegistry();

	return readdirSync(DIR)
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map((name) => {
			const raw = readFileSync(join(DIR, name), "utf8");
			const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
			if (match === null) throw new Error(`${name} has no frontmatter.`);

			// YAML 1.2's core schema has no timestamp type, so `released: 2021-03-14`
			// would arrive as a string. Astro's frontmatter parsing yields a Date, and
			// the schema is written for a Date — so the helper has to match.
			const parsed = releaseSchema.safeParse(parse(match[1], { customTags: ["timestamp"] }));
			if (!parsed.success) {
				throw new Error(
					`${name} does not validate:\n`
					+ parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
				);
			}

			return { ...parsed.data, slug: name.replace(/\.md$/, ""), body: match[2].trim() };
		});
}
