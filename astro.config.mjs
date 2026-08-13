// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	// The public URL. Needed here rather than only at deploy time because the
	// feed (#34) has to emit absolute links, and a feed reader has nothing
	// else to resolve them against. #35 settles the canonical URLs on top of
	// it and #39 wires the deploy.
	site: "https://mthomes.github.io/goat-test",

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
