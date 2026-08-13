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
	 * Must track `--colour-paper` in `src/styles/tokens.css`. A `theme-color`
	 * meta cannot read a custom property, so this is the one colour value
	 * outside the token layer — and a guardrail test (#49) asserts the two
	 * stay equal rather than trusting a comment to keep them that way.
	 */
	themeColour: "#f2ede1",
} as const;
