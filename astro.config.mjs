// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	build: {
		// One stylesheet, always external. Astro's `auto` mode inlines small
		// sheets into every page, which would scatter the cascade across the
		// build output and make the layer-order guardrail (#49) unauditable.
		inlineStylesheets: "never",
	},
});
