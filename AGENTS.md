# Repository Guidelines

## Project Structure & Module Organization

This repository contains two dependency-free browser games:

- `catch-the-food/` is the production game published to GitHub Pages. `index.html` defines accessible UI, `styles.css` controls presentation, and `game.js` owns state, input, rendering, audio, and progression.
- `catch-the-food/assets/characters/` and `assets/food/` contain the coordinated SVG artwork. Keep assets transparent and readable at small sizes.
- `catch-the-food/version.js` provides the local `1.0.dev` fallback. The deployment workflow replaces it with a numbered production version.
- `cat-math/` is a separate experimental game. Do not change or stage its files when working only on Catch The Food.
- `.github/workflows/deploy.yml` publishes `catch-the-food/` on pushes to `main`.

## Build, Test, and Development Commands

There is no build step or dependency installation. Serve files over HTTP during development:

```sh
python3 -m http.server 8765 --directory catch-the-food
```

Then open `http://localhost:8765/`. Useful validation commands:

```sh
node --check catch-the-food/game.js
xmllint --noout catch-the-food/assets/**/*.svg
git diff --check
```

## Coding Style & Naming Conventions

Use four-space indentation in HTML, CSS, and JavaScript. Prefer `const`, small named functions, camelCase variables/functions, and UPPER_SNAKE_CASE constants. Use kebab-case CSS classes and lowercase descriptive asset filenames such as `assets/food/tomato.svg`. Keep the project framework-free and avoid external runtime dependencies. Scope touch and selection behavior to the game surface instead of disabling browser accessibility globally.

## Testing Guidelines

No automated framework is configured. Before submitting changes, run the syntax checks above and manually test character selection, keyboard and touch movement, pause/resume, scoring, game over, and restart. Check desktop, narrow portrait, and landscape layouts. For interaction changes, test Mobile Safari or an iPad when possible.

## Versioning & Deployment

Every deployed revision must receive a higher visible version. Do not manually replace the `1.0.dev` fallback in `catch-the-food/version.js`. Push release changes through `.github/workflows/deploy.yml`; its version-stamping step automatically writes `1.0.<GitHub run number>`. After deployment, verify that the header badge increased and matches the published `version.js`.

## Commit & Pull Request Guidelines

Always commit completed repository changes after validation; do not leave requested work only in the working tree. Recent commits use short imperative summaries, for example `Increase food speed after each catch`. Keep commits focused and stage only relevant files—never include unrelated user changes. Pull requests should describe player-visible behavior, list validation performed, and include screenshots for visual or responsive changes. Link related issues when available and confirm that the Pages workflow succeeds.
