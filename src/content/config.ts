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
	loader: glob({ pattern: "**/*.md", base: "./src/content/releases" }),
	schema: releaseSchema,
});

export const collections = { releases };
