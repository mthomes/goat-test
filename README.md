# goat-test

Release notes for a person — four years of a life shipped as a changelog.

A static site built with [Astro](https://astro.build), [CUBE CSS](https://cube.fyi)
and **zero bytes of client-side JavaScript**.

## Requirements

| Tool | Version |
| ---- | ------- |
| Node | see `.nvmrc` (`>=22.12.0`) |

## Scripts

| Script | Does |
| ------ | ---- |
| `npm run dev` | Start the dev server |
| `npm run build` | Produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Type-check the project with `astro check` |

## Layout

```
src/
  components/  Astro components (Block-layer markup)
  content/     Content collections and the release corpus
  layouts/     Page shells
  lib/         Pure TypeScript — semver, the known-issue model, the query layer
  pages/       Routes
  styles/      The whole design system, global CUBE CSS
```
