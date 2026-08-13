// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	// The production URL, settled here (#35) and used by the deploy (#39).
	//
	// This is a GitHub Pages *project* site, so it is served from a
	// subdirectory rather than from the root. `base` has to be set for that,
	// and every internal link has to carry it — `src/lib/format.ts` is the one
	// place that happens, so there is a single thing to get right.
	site: "https://mthomes.github.io",
	base: "/goat-test",

	integrations: [sitemap()],

	vite: {
		build: {
			// Lightning CSS drops the `@layer …;` statement when it can prove the
			// blocks already appear in that order. Sound, but it deletes the one
			// line that makes the order explicit rather than emergent — reorder
			// an import and the cascade changes silently. esbuild keeps it.
			cssMinify: "esbuild",
		},
	},

	build: {
		// One stylesheet, always external. Astro's `auto` mode inlines small
		// sheets into every page, which would scatter the cascade across the
		// build output and make the layer-order guardrail (#49) unauditable.
		inlineStylesheets: "never",
	},
});
