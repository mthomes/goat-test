/**
 * The `releases` collection — the only collection on the site.
 *
 * Astro 7 looks for `src/content.config.ts`; that file re-exports this one,
 * which is where the collection is actually defined.
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

import { releaseSchema } from "./schema";

const releases = defineCollection({
	loader: glob({
		pattern: "**/*.md",
		base: "./src/content/releases",
		// The default slugifies `32.0.0.md` into `32-0-0`, which then no longer
		// matches the version it was named after. Every lookup in the project is
		// by version, so the id is the version.
		generateId: ({ entry }) => entry.replace(/\.md$/, ""),
	}),
	schema: releaseSchema,
});

export const collections = { releases };
