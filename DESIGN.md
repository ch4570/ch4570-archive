# Rex Terminal Archive + Emerald Documents

홈은 이력서·경력기술서·포트폴리오·공개 활동을 하나로 합친 다크 터미널형 커리어 아카이브입니다. 제출용 이력서, 경력기술서, 포트폴리오는 기존 Emerald Console의 흰 캔버스와 A4 출력 계약을 유지합니다. 두 레이어는 에메랄드 신호색, 모노스페이스 메타데이터, 얇은 시스템 경계선이라는 공통 언어로 연결됩니다.

## 0. Reference And Immutable Template

### Reference

- Primary design reference: `https://getdesign.md/supabase/design-md`
- Rendered reference: `https://getdesign.md/design-md/supabase/preview`
- Upstream source: `VoltAgent/awesome-design-md`, `design-md/supabase/DESIGN.md`
- Extracted revision: `4482a96f9c1f2426ab08c570f86c84ee045534c8` (2026-05-17)
- Runtime evidence was collected at 1280×900 and 375×812 with real Chrome and `getComputedStyle`.
- The reference is inspiration, not affiliation. Supabase logos, trademarks, copy, screenshots, and proprietary fonts are not used.

The current reference is a **white-canvas system**, not the older dark-only interpretation: `#ffffff` canvas, `#171717` ink, `#3ecf8e` primary, `#dfdfdf` hairline, 6px buttons, 12px cards, and a single dark inverted surface.

### Immutable Template

The following submission-document HTML files are structural and content baselines. The unified home (`index.html`) is intentionally excluded because it is the evolving public archive surface.

| File | SHA-256 baseline |
| --- | --- |
| `resume/index.html` | `a8e8d4c10c8513d2da5c2a84ce10bb01d1a28f4b68a7310935eae6310d4e333b` |
| `career/index.html` | `2901a8115d1b7ff2a91d38a05604215a1c592798472b19a46031c81162889977` |
| `portfolio/index.html` | `ed341baa65b4b3d22d3e773c4da20be48baa24331bc410d330d88268d26a85b4` |

## 1. Direction

- Atmosphere: **quietly technical, precise, credible**.
- Signature material: white interface panes separated by cool-gray 1px hairlines.
- Color story: near-monochrome canvas with emerald reserved for primary action, current state, small markers, and focus.
- Signature moment: the strongest evidence surface flips to `canvas-night`; the remaining document stays white.
- Profile photography remains real and local, presented like a clean product pane rather than a decorative portrait collage.
- Information hierarchy comes from type size, spacing, borders, and polarity. Color never carries meaning alone.
- There are no pastel bands, atmospheric gradients, glass cards, glow effects, rotated paper layers, or large decorative circles.

## 2. Tokens

### Color

| Token | Value | Role |
| --- | --- | --- |
| `--sb-primary` | `#3ecf8e` | primary CTA, current marker |
| `--sb-primary-deep` | `#24b47e` | pressed and strong hover |
| `--sb-primary-soft` | `#4ade80` | small diagram/status accent only |
| `--sb-ink` | `#171717` | primary text |
| `--sb-ink-secondary` | `#212121` | emphasized body text |
| `--sb-muted` | `#707070` | supporting copy |
| `--sb-muted-2` | `#9a9a9a` | tertiary metadata |
| `--sb-faint` | `#b2b2b2` | disabled or incidental copy |
| `--sb-canvas` | `#ffffff` | page and document canvas |
| `--sb-canvas-soft` | `#fafafa` | alternate band and compact panel |
| `--sb-canvas-night` | `#1c1c1c` | one featured evidence surface |
| `--sb-canvas-night-soft` | `#202020` | nested dark cells |
| `--sb-on-dark` | `#ffffff` | text on night surfaces |
| `--sb-hairline` | `#dfdfdf` | default divider |
| `--sb-hairline-cool` | `#ededed` | subtle divider |
| `--sb-hairline-strong` | `#c7c7c7` | emphasized control boundary |
| `--sb-selection` | `rgba(62, 207, 142, 0.32)` | text selection |
| `--sb-focus` | `#24b47e` | keyboard focus |

Emerald is scarce. A normal viewport should contain one filled emerald control and a small number of rules or dots, not broad green panels.

### Elevation

| Token | Value | Use |
| --- | --- | --- |
| `--sb-shadow-1` | `0 1px 3px rgba(0, 0, 0, 0.06)` | portrait and compact pane |
| `--sb-shadow-2` | `0 8px 24px rgba(0, 0, 0, 0.08)` | document shell |
| `--sb-shadow-3` | `0 16px 48px rgba(0, 0, 0, 0.12)` | toast only |

Default cards are flat. Border contrast is the primary depth system.

### Radius

| Token | Value | Use |
| --- | ---: | --- |
| `--sb-radius-xs` | `4px` | labels and tiny chrome |
| `--sb-radius-sm` | `6px` | buttons and controls |
| `--sb-radius-md` | `8px` | compact cards |
| `--sb-radius-lg` | `12px` | document cards and portrait panes |
| `--sb-radius-xl` | `16px` | outer document shell |
| `--sb-radius-full` | `9999px` | status dots and tags only |

Buttons and navigation controls are never pill-shaped.

### Spacing

- Base unit: 8px.
- Fine tokens: 2, 4, 8, 12px.
- Primary scale: 16, 24, 32, 48, 64, 80, 96px.
- Content width: 1184px.
- Reading measure: 720px.
- Inset: 48px desktop, 32px tablet, 20px mobile.
- Major section rhythm: 96px desktop, 72px tablet, 56–64px mobile.
- Touch targets: 44px minimum.

## 3. Typography

No external font or new runtime dependency is added.

- UI/display stack: `Pretendard`, `SUIT`, `Apple SD Gothic Neo`, `Noto Sans KR`, `Helvetica Neue`, system sans-serif.
- Technical stack: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, monospace.
- Display: 64px / 700 / 1.10 / `-0.03em`.
- Section opener: 48px / 700 / 1.12 / `-0.024em`.
- Card title: 28–32px / 700 / 1.22 / `-0.018em`.
- Compact heading: 22–24px / 700 / 1.33.
- Body lead: 18px / 400 / 1.62.
- Body: 16px / 400 / 1.62.
- UI control: 14px / 700 / 1.
- Caption: 13px / 500 / 1.45.
- Technical label: 12px / 600 / 1.35 / `0.08em`.

The reference uses weight 500 display type. Korean glyph rendering needs slightly stronger weight, so public Hangul headings use 700 without exceeding it. Dense labels, dates, sequence numbers, and English document labels use the technical stack.

Korean clauses must wrap naturally. `nowrap` is reserved for dates, short technology names, and compact role fragments.

## 4. Layout And Depth

- Preserve every current grid, section order, and DOM grouping.
- Translate current panels into interface panes: white or `canvas-soft`, 1px hairline, 8–16px radius.
- Use a single dark inverted panel per document at most.
- Do not tint each sibling card differently.
- Do not add full-bleed imagery, atmospheric gradients, or decorative background shapes.
- Photo and diagram frames may receive Level 1 elevation; outer document shells may receive Level 2. Repeated content cards stay flat.
- Desktop document surfaces remain centered and bounded. Mobile layouts stack without horizontal overflow.

## 5. Shared Primitives And States

### Site Header

- White 64px desktop header with a cool hairline bottom border.
- Brand mark is an 8px near-black square with an emerald status edge.
- Navigation is plain text. Current page uses a 2px emerald bottom rule, not a colored pill.
- Right utility uses `button-primary-green`.
- At 700px and below, the unchanged structure becomes two rows: brand/utility first, three document links second.

States:

- Default: ink text on white.
- Hover: `canvas-soft` background or ink underline.
- Current: ink text plus 2px emerald rule.
- Focus-visible: 2px emerald outline with 3px offset.

### Button

- Primary: emerald fill, near-black text, 6px radius, 44–48px height.
- Secondary: white fill, strong hairline, near-black text, 6px radius.
- Dark: night fill, white text, 6px radius.

States:

- Hover: border or fill shifts one token; no movement.
- Pressed: primary uses `primary-deep`; controls use `translateY(1px)` only during press.
- Focus-visible: 2px emerald outline with 3px offset.
- Reduced motion: transition removed.

### Interface Portrait

- Real source remains `assets/profile.jpg`, 689×886.
- The image sits in a white or soft-canvas pane with 1px hairline, 12px outer radius, and 8px image radius.
- A small emerald status dot or top rule may appear in the pane chrome.
- No filter, green overlay, rotated sheet, thick white frame, or face-obscuring decoration.
- Resume print retains a compact portrait. Career and portfolio print hide it to protect page contracts.

### Document Card

- White canvas, 1px hairline, 12px radius, 24–32px padding.
- Label uses the technical type.
- The career-description card may be the single inverted featured card on the home page.
- Hover changes hairline to emerald and applies Level 1 elevation.

### Evidence Row

- Order remains period → company/scope → role/result.
- Period and sequence use technical type with tabular numerals.
- Hairlines separate rows.
- Current employment receives an emerald left or top rule, not a tinted background.

### Outcome Panel

- Default: white, hairline, 12px radius.
- Quiet alternative: `canvas-soft`.
- Featured: `canvas-night` with white text, nested `canvas-night-soft` cells, and a small emerald marker.
- Long text never uses emerald as its primary text color.

### Diagram Pane

- White interface pane, 1px hairline, 8–12px radius.
- Native SVG colors remain intact.
- Caption uses technical type.
- At 375px the complex SVG keeps a readable 720px working width inside an explicitly labeled horizontal scroll pane; text and connectors must not overlap.

### Toast

- Night surface, white text, 8px radius, Level 3 elevation.
- No blur or glass effect.

## 6. Page Application

### Home

- Home is the unified career archive and uses the dedicated `assets/terminal-home.css` layer.
- Dark near-black canvas, phosphor-lime signal color, visible grid, square borders, and system monospace metadata create the terminal mood.
- The first viewport leads with identity, operating principle, profile, and one primary action. It must expose the next content cue without hiding it.
- Evidence order is impact metrics → career timeline → selected work → public activity → submission documents → contact.
- Production and public metrics must include their unit or scope. GitHub values include a checked date and exclude private activity explicitly.
- Light paper sections separate case studies and documents from the dark console without changing the terminal geometry.
- The hero carries two low-contrast terminal-log sheets that stream real development commands and runtime states using transform-only motion.
- Scroll reveals use opacity and transform only, preserve content without JavaScript, and disappear entirely under `prefers-reduced-motion`.

### Resume

- Outer document is a white 16px shell over `canvas-soft`.
- Hero becomes a white identity pane separated by a hairline.
- Skill summary becomes the single night/code-like block on screen.
- Experience uses hairline sections; current employment gets an emerald rule.
- Print stays exactly one A4 page and converts the night block back to light.

### Career Description

- Hero and career overview become white/soft interface panes.
- Company headings retain the existing company → role/product hierarchy.
- Project cards are white hairline surfaces with no alternating color wash.
- The JPA correction result remains the single night featured panel.
- Print stays exactly two A4 pages and keeps Worksphere context at the start of page 2.

### Portfolio

- Hero becomes white; the unchanged profile aside becomes a night interface pane.
- Sticky case navigation uses a white hairline rail and an emerald current marker.
- Case sections use white hairline surfaces. Only the JPA case is visually featured through a night header/panel treatment.
- Fact tables and story blocks rely on hairlines, not pastel fills.
- Diagram remains a white pane and fully fits at 375px.
- Print stays exactly three A4 pages and removes dark fills.

## 7. Responsive

| Width | Inset | Header | Identity | Content |
| --- | ---: | --- | --- | --- |
| 1280px | 48px | 64px single row | full two-column | bounded by 1184px |
| 768px | 32px | 64px single row | compact two-column where possible | timeline narrative moves to full row |
| 375px | 20px | two 44px rows | single column | cards and evidence rows stack |

- All navigation destinations remain visible at 375px.
- Mobile header labels stay readable; do not shrink below 12px.
- Portraits stay inside their panes. The mobile diagram may exceed its viewport only inside the bounded, labeled scroll pane.
- 200% zoom must not introduce horizontal page scrolling.
- Sticky case navigation must not cover anchors.

## 8. Print

- `@page`: A4, 10mm.
- Canvas is white, text is black/near-black, rules are neutral gray.
- Emerald is limited to thin rules and tiny markers.
- All night surfaces convert to white or 3–5% gray with dark text.
- Shadows, sticky elements, buttons, progress, toast, and decorative pseudo-elements are removed.
- Text and links remain selectable.
- Exact contracts: Resume 1 page, Career 2 pages, Portfolio 3 pages.

## 9. Accessibility And Performance

- Normal body and metadata meet WCAG AA contrast.
- Focus-visible is not replaced by hover.
- Current states use rule/weight plus color.
- Touch targets are at least 44×44px.
- DOM reading order and keyboard order remain unchanged.
- `prefers-reduced-motion` removes transitions and smooth scroll.
- No new external fonts, images, scripts, or dependencies.
- Local images keep intrinsic dimensions to prevent CLS.
- CJK orphan lines, clipped glyphs, broken technical names, diagram overlaps, and horizontal overflow block release.

## 10. Personas, Critique, And Accepted Debt

Primary persona: a technical recruiter scanning for chronology and business impact. Secondary persona: a backend interviewer validating implementation depth and evidence.

The visual system must support:

- a 10-second identity and chronology scan,
- a 60-second results scan,
- deep reading of one project without losing company context,
- keyboard navigation and 200% zoom,
- standalone PDF review.

Accepted debt:

- Circular is proprietary, so the local Korean system stack substitutes for it.
- Existing HTML class names may retain old semantic names such as `lavender` or `peach`; CSS maps them to the new neutral system because structure is explicitly immutable.
- The historical CSS baseline remains below the final public override for compatibility with the admin renderer. The final scoped layer is the source of truth for public pages.
