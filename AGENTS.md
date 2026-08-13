# goat-test — project rules

## Hard constraints

These are not preferences. A change that violates one of them is wrong,
however well it reads.

1. **Zero client-side JavaScript.** No framework islands, no hydration
   directives, no inline scripts. The build output ships zero bytes of JS.
   Anything that needs JS to work does not go on this site.
2. **CSS is fully global, under a single cascade layer order.**
   `src/styles/index.css` is the only stylesheet, imported exactly once from
   `src/layouts/BaseLayout.astro`. The order is declared once, before any
   `@import`:

   ```css
   @layer reset, tokens, composition, utility, block, exception;
   ```

3. **No `<style>` block in any `.astro` file, ever.** A scoped style block is
   *unlayered*, and unlayered styles beat every layered style regardless of
   specificity — one of them is enough to make the whole cascade
   unpredictable. Enforced by `npm run lint:style-blocks`.
4. **No hardcoded colours, sizes or spacing outside the token layer.** Every
   value in every other layer resolves through a custom property.
5. **Dark mode via `prefers-color-scheme` only.** No toggle, no persistence,
   no flash of the wrong theme. Only token *values* change; token names never do.
6. **No `!important`, anywhere.** The layer order is the conflict-resolution
   mechanism; an `!important` says the order is wrong.
7. **Motion is opt-in.** A `transition` or `animation` may only be declared
   inside `@media (prefers-reduced-motion: no-preference)`. The reduced-motion
   reset everyone copies neutralises motion with `!important`, which rule 6
   forbids — so this project never declares the motion in the first place. The
   guard in `reset.css` stays as a backstop, not as the mechanism.

## The layers

Written to in this order, resolved in this order. Later layers win.

| Layer | Lives in | Holds |
| ----- | -------- | ----- |
| `reset` | `src/styles/reset.css` | The global tier — a minimal reset, plus element-level defaults such as global typography. Nothing class-based. |
| `tokens` | `src/styles/tokens.css` | Custom properties only. The one place literal colours, sizes and spacing values are allowed to appear. |
| `composition` | `src/styles/composition.css` | Layout primitives that arrange things without knowing what those things are. No colour, no typography, no borders. |
| `utility` | `src/styles/utility.css` | Single-purpose classes, each tracing back to a token. |
| `block` | `src/styles/blocks/*.css` | The site's own components. One file per block, each wrapping itself in `@layer block`. |
| `exception` | `src/styles/exception.css` | Documented, deliberate local variation, expressed as `data-*` attributes. Never `!important`. |

## Exceptions

`data-*` attributes, never modifier classes — an exception is *state*, and a
`data-` attribute says so out loud where `.card--major` just looks like another
class. An exception retunes a Block's own custom properties rather than
reaching inside it.

An exception is legitimate when it varies an existing Block, is driven by data
rather than by page position, and leaves the Block working if you delete it.
It signals a **missing Block** when it is longer than the thing it modifies,
when it changes layout rather than treatment, when it only applies on one page,
or when you start climbing specificity to reach a target. Full rule, with
reasoning, at the top of `src/styles/exception.css`.

Every layer file wraps its own contents in its `@layer` block, so the import
order in `index.css` is a convenience, not a load-bearing decision.

## Art direction

A 1987 printed technical manual. Serif for prose, monospace for metadata,
cream paper and ink black with an oxblood accent, hairline rules, and
typographic sigils for change types — never coloured pills.

## Development

```
npm run dev                 # dev server
npm run build               # production build into dist/
npm run preview             # serve the production build
npm run check               # astro check
npm run lint:style-blocks   # assert no <style> blocks in .astro sources
```

When starting the dev server in an agent session, use background mode:
`astro dev --background`. Manage it with `astro dev stop`, `astro dev status`
and `astro dev logs`.

## Documentation

Full Astro documentation: https://docs.astro.build

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles](https://docs.astro.build/en/guides/styling/)
