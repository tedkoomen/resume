# Screaming Into The Void redesign notes

Implemented a dark editorial direction for the Gatsby site:

- Reworked the global visual system in `src/components/Layout/layout.scss`.
- Rebuilt header/footer styling in `src/components/Header` and `src/components/Layout`.
- Converted post cards into numbered dispatch rows in `src/components/Card` and `src/components/CardContainer`.
- Reworked the homepage, archive, article template, about page, and resume page.
- Added SVG identity assets under `static/icons` and `src/images/void-eclipse.svg`.
- Removed newsletter/subscribe UI from the implementation for now.
- Removed bundled font binaries. The design uses local/system font stacks, so licensed font files can be added locally later if desired.

I was not able to complete a Gatsby production build inside the sandbox because dependency installation timed out. Run `npm ci && npm run build` locally or on Netlify after unzipping.
