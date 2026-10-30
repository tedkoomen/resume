# Quiet Terminal

The site uses IBM Plex Mono, a charcoal dark theme, and a parchment light theme.
All titles and article text use explicit theme colors. The header toggle remembers
an explicit preference in localStorage; first visits follow the operating system.
A pre-paint script in `gatsby-ssr.js` applies the preference before rendering.

## Development and verification

- `npm ci`
- `npm test` checks saved preferences, system defaults, and blocked storage.
- `npm run build` generates the production site in `public/`.
- `npm run develop` starts the Gatsby development server.

The existing Gatsby/Netlify hosting setup is retained. Article body text and URLs
are unchanged. About and resume pages inherit the same typography and theme.

## Social cards

Each current article references its own 1200 × 630 PNG in its frontmatter:

- AI and the Illusion of Optimization: a lost-update counter.
- Optimizing the Wrong Thing, Faster: an upstream bottleneck schematic.
- Why I'm Building a Server Framework in Zig: the Zails event pipeline.

The title is embedded in each image. Open Graph and Twitter metadata share the
same image, dimensions, and descriptive alt text. Other pages use
`static/social/site.png`. Social cards deliberately use the charcoal palette;
link crawlers do not receive a visitor's selected color theme.

To regenerate the committed PNGs, install Pillow in a Python environment and run
`python3 scripts/generate-social-cards.py`. IBM Plex Mono TTF sources, web WOFF2
fonts, and the SIL Open Font License are included in `static/fonts/`.

Verification completed: production build, theme unit tests, unique 1200 × 630
metadata for all three articles, preserved article bodies, and browser checks
for both color themes, navigation, and persisted selection.

## Article reading and diagrams

- Mermaid fenced blocks render lazily as accessible, theme-aware SVG diagrams. Rendering is serialized, reruns on theme changes, and retains a readable source fallback if loading fails.
- Horizontal flowcharts switch to vertical layouts on small screens. Wider diagrams scroll inside a keyboard-focusable region instead of shrinking labels or overflowing the page.
- Each post has a three-point overview, linked contents (sticky on desktop, collapsible on mobile), numbered major section dividers, and highlighted pull quotes.
- Heading hierarchy is normalized to one page title. A local Remark plugin and shared slug utility keep heading IDs and contents links aligned.
- Existing code examples and article claims are preserved; dense paragraphs are split and the Zig subsystem overview is a list.
- Validation: seven Node tests, Gatsby production build, generated anchor checks, and browser checks of all three articles, light/dark themes, and 320/390px layouts.
