import type { Page } from "@playwright/test";

/** Fetch the single stylesheet the page links, as text. */
export async function builtCss(page: Page): Promise<string> {
	return page.evaluate(async () => {
		const href = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!.href;
		return (await fetch(href)).text();
	});
}

/**
 * Everything inside `@layer <name>{ … }`, across **every** block of that layer.
 *
 * The bundler emits one block per source file rather than merging them, so
 * slicing from the first `@layer block{` to the next `@layer ` reads a single
 * file's worth and silently ignores the rest. Braces are matched rather than
 * searched for, because layer bodies nest.
 */
export function layerBody(css: string, name: string): string {
	const open = `@layer ${name}{`;
	const bodies: string[] = [];

	for (let at = css.indexOf(open); at !== -1; at = css.indexOf(open, at + 1)) {
		let depth = 1;
		let cursor = at + open.length;
		while (cursor < css.length && depth > 0) {
			if (css[cursor] === "{") depth += 1;
			else if (css[cursor] === "}") depth -= 1;
			cursor += 1;
		}
		bodies.push(css.slice(at + open.length, cursor - 1));
	}

	return bodies.join("\n");
}
