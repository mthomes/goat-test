/**
 * Stylelint as the mechanical half of CUBE.
 *
 * The methodology is a set of conventions, and a convention nothing enforces
 * is a preference. Everything asserted here is also asserted against build
 * output by #49 — deliberately. Stylelint catches it while you are typing;
 * the guardrails catch what a bundler or an integration puts back.
 */
const CANONICAL_LAYERS = ["reset", "tokens", "composition", "utility", "block", "exception"];

export default {
	extends: ["stylelint-config-standard"],
	plugins: ["./stylelint-plugins/layer-order.mjs"],

	rules: {
		// Wrapped: Stylelint reads a bare array as [primary, secondaryOptions],
		// which would hand the rule the string "reset" as its whole config.
		"goat/layer-order": [CANONICAL_LAYERS],

		// CUBE's whole premise: the layer order resolves conflicts, so nothing
		// needs to climb specificity and nothing may opt out of the cascade.
		"selector-max-id": 0,
		"selector-max-specificity": "0,3,0",
		"declaration-no-important": true,

		// One naming pattern for every custom property in the project.
		"custom-property-pattern": "^[a-z][a-z0-9]*(-[a-z0-9]+)*$",
		"selector-class-pattern": "^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?$",

		// Colour literals belong to the token layer and nowhere else. Overridden
		// for tokens.css below, which is the one file allowed to hold them.
		"color-no-hex": true,
		"color-named": "never",
		"function-disallowed-list": ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch"],

		// Astro's build inlines @import, so the source order is ours to keep tidy.
		"no-invalid-position-at-import-rule": [true, { ignoreAtRules: ["layer"] }],
		// Plain strings, which is what the CSS spec now prefers over url().
		"import-notation": "string",

		// Noise from the standard config that fights this codebase's house style.
		"comment-empty-line-before": null,
		"declaration-empty-line-before": null,
		"custom-property-empty-line-before": null,
		"no-descending-specificity": null,
	},

	overrides: [
		{
			// The token layer is the one place a literal colour may appear. That
			// is the point of a token layer.
			files: ["src/styles/tokens.css"],
			rules: {
				"color-no-hex": null,
				"function-disallowed-list": null,
			},
		},
	],

	ignoreFiles: ["dist/**", "coverage/**", "node_modules/**", "test-results/**", "playwright-report/**"],
};
