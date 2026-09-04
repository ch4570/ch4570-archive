# Rex Terminal Archive — Master Design System

Generated from the UI/UX Pro Max terminal/retro portfolio direction and calibrated for a Korean backend-engineering hiring context.

## Product intent

- Product: unified resume, career description, portfolio, and public-activity archive.
- Primary user: technical recruiter scanning identity, chronology, and measurable outcomes.
- Secondary user: backend interviewer validating problem framing and implementation depth.
- Mood: terminal-native, precise, credible, slightly retro; never game-like or novelty-first.

## Page architecture

1. Identity and operating principle
2. Quantified impact
3. Career timeline
4. Selected engineering cases
5. GitHub, open source, writing, and speaking
6. Submission documents
7. Contact

Every main section is directly linkable with an anchor. The sticky desktop navigation exposes the current section, while mobile keeps the brand and contact action only.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `--term-bg` | `#080b09` | main dark canvas |
| `--term-panel` | `#0e1310` | terminal panels |
| `--term-line` | `#293229` | passive separators |
| `--term-line-strong` | `#5e6c5b` | control and panel boundaries |
| `--term-ink` | `#f3f7ef` | primary dark-mode text |
| `--term-muted` | `#98a394` | secondary dark-mode text |
| `--term-dim` | `#7f8a7c` | tertiary dark-mode metadata |
| `--term-green` | `#b6f542` | primary action and system signal |
| `--term-green-ink` | `#4a6800` | green text on paper |
| `--term-paper` | `#f1f0e8` | case-study and document surface |
| `--term-paper-ink` | `#10130f` | text and borders on paper |

Normal text/background pairs meet WCAG AA. Color never carries state alone: labels, borders, and position reinforce green signals.

## Typography

- Display/body: local Korean system sans stack for fast, reliable glyph rendering.
- Technical metadata: local system monospace stack.
- No external font requests or runtime font dependency.
- Display headings: 38–118px, 800 weight, tight tracking.
- Body: 15–17px, 1.65–1.8 line-height.
- Labels: 9–12px monospace with high-contrast colors.
- Metrics use monospaced, tabular-feeling figures with explicit units.

## Geometry and layout

- Maximum content width: 1240px.
- Desktop gutter: 32px per side; mobile gutter: 14–18px per side.
- Primary section spacing: 112px desktop, 76px mobile.
- Corners remain square. Depth comes from borders, polarity, and sparse hard shadows.
- Dark grid uses a 40px rhythm. Component spacing follows 4/8px increments.
- Breakpoints: 420, 760, and 1080px; verified viewports: 375, 768, 1024, 1440px.

## Components

- Header: 64px desktop / 58px mobile, sticky, 44px minimum targets.
- Terminal window: title bar, status square, border, content; no ornamental fake controls.
- Primary button: lime fill with dark text; only one visually dominant action per section.
- Metric card: large number, machine-readable label, plain-language evidence sentence.
- Career row: period first, then company/product and result; current role gets a text badge plus green treatment.
- Case card: problem-led headline, evidence paragraph, technology or process metadata.
- Public-data panel: source scope and checked date are always visible.

## Motion

- Reveal uses opacity and `translateY(18px)` only, 420ms.
- The hero may run one ambient terminal-log effect built from two transform-only sheets; it stays decorative, low-contrast, and behind all readable content.
- Content is visible without JavaScript.
- `prefers-reduced-motion` removes the ambient log stream, reveal transitions, cursor blinking, and smooth scrolling.
- Interaction never depends on animation completion.

## Accessibility and performance

- One `h1`; sequential heading structure.
- Skip link and visible focus ring.
- Profile image has intrinsic dimensions and descriptive alt text.
- All primary touch targets are at least 44px.
- No horizontal page overflow from 375px upward.
- No external imagery, font, animation, or chart dependency.
- Static GitHub metrics avoid runtime API latency and layout shift; refresh the checked date when values change.

## Relationship to submission documents

`resume/`, `career/`, and `portfolio/` remain print-first Emerald Console documents governed by the A4 contracts in the root `DESIGN.md`. The terminal system applies to the unified home only.
