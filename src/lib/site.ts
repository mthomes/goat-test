/**
 * Facts about the site itself, in one place so the header, the document
 * title, the feed and the Open Graph tags cannot disagree about them.
 */
export const SITE = {
	name: "HUMAN/1",
	tagline: "Maintenance Release Notes",
	description:
		"Four years of one person's life, shipped as release notes. "
		+ "Semantically versioned, exhaustively changelogged, still full of known issues.",
	/**
	 * Must track `--colour-paper` in `src/styles/tokens.css`, in both
	 * schemes. A `theme-color` meta cannot read a custom property, so these
	 * are the only colour values outside the token layer — and a guardrail
	 * test (#49) asserts they stay equal to the tokens rather than trusting a
	 * comment to keep them that way.
	 */
	themeColour: {
		light: "#f2ede1",
		dark: "#131a21",
	},
} as const;
