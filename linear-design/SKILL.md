---
name: linear-design
description: Design system skill for linear. Activate when building UI components, pages, or any visual elements. Provides exact color tokens, typography scale, spacing grid, component patterns, and craft rules. Read references/DESIGN.md before writing any CSS or JSX.
---

# linear Design System

You are building UI for **linear**. Dark-themed, cool palette, sans-serif typography (Arial), compact density on a 4px grid, expressive motion.

## Visual Reference

**IMPORTANT**: Study ALL screenshots below before writing any UI. Match colors, typography, spacing, layout, and motion exactly as shown.

### Homepage

![linear Homepage](screenshots/homepage.png)

> Read `references/DESIGN.md` for full token details.

## Design Philosophy

- **Layered depth** — use shadow tokens to create a sense of physical layering. Each elevation level has a specific shadow.
- **Gradient accents** — gradients are used thoughtfully for emphasis, not decoration.
- **Type pairing** — Arial for body/UI text, Inter Variable for headings/display. Never introduce a third typeface.
- **compact density** — 4px base grid. Every dimension is a multiple of 4.
- **cool palette** — the color temperature runs cool, matching the sans-serif typography.
- **Restrained accent** — `#7170ff` is the only pop of color. Used exclusively for CTAs, links, focus rings, and active states.
- **Expressive motion** — animations are an integral part of the experience. Use spring physics and layout animations.

## Color System

### Core Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background | `--background` | `#080808` | Page/app background |
| Surface | `--surface` | `#191d20` | Cards, panels, modals |
| Text Primary | `--text-primary` | `#ffffff` | Headings, body text |
| Text Muted | `--text-muted` | `#6b6b6b` | Captions, placeholders |
| Accent | `--accent` | `#7170ff` | CTAs, links, focus rings |
| Border | `--border` | `#2a2e33` | Dividers, card borders |

### Status Colors

| Status | Hex | Use |
|--------|-----|-----|
| Danger | `#eb5757` | Errors, destructive actions |

### Extended Palette

- `#9c9da1`
- **color-bg-tertiary:** `#f4f2f4` — Light surface or highlight color
- `#4b4f54`
- **color-button-invert-bg:** `#e2e4e7` — Light surface or highlight color
- **color-link-primary:** `#818fff`
- **color-teal:** `#02b8cc`
- `#585a5c`
- **color-indigo:** `#5e6ad2`

### CSS Variable Tokens

```css
--header-border: transparent;
--header-border: #ffffff14;
--header-border: #00000014;
--header-border: #ffffff14;
--header-border: #00000014;
--inner-card-border: 1px;
--label-muted: var(--color-text-quaternary);
--border-solid: #2a2e33;
--border-thin: #24282c;
--border-faint-thin: #191d21;
--border-frame: #151616;
--layer-popover: 600;
--border-hairline: 1px;
--border-hairline: .5px;
--header-border: #ffffff14;
--color-bg-primary: #08090a;
--color-bg-secondary: #1c1c1f;
--color-border-primary: #23252a;
--color-border-secondary: #34343a;
--color-border-tertiary: #3e3e44;
```

## Typography

### Font Stack

- **Arial** — Heading 1, Heading 2, Heading 3
- **Inter Variable** — Body, Caption
- **Berkeley Mono** — Code

### Font Sources

```css
@font-face {
  font-family: "Inter Variable";
  src: url("fonts/InterVariable-100.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Berkeley Mono";
  src: url("fonts/BerkeleyMono-100.woff2") format("woff2");
  font-weight: 100;
}
```

### Type Scale

| Role | Family | Size | Weight |
|------|--------|------|--------|
| Heading 1 | Arial | 40px | 700 |
| Heading 2 | Arial | 38px | 700 |
| Heading 3 | Arial | 2.25rem | 700 |
| Body | Inter Variable | 14px | 400 |
| Caption | Inter Variable | 13px | 400 |
| Code | Berkeley Mono | 14px | 400 |

### Typography Rules

- Body/UI: **Arial**, Headings: **Inter Variable** — these are the only display fonts
- Max 3-4 font sizes per screen
- Headings: weight 600-700, body: weight 400
- Use color and opacity for text hierarchy, not additional font sizes
- Line height: 1.5 for body, 1.2 for headings

## Spacing & Layout

### Base Grid: 4px

Every dimension (margin, padding, gap, width, height) must be a multiple of **4px**.

### Spacing Scale

`2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24` px

### Spacing as Meaning

| Spacing | Use |
|---------|-----|
| 4-8px | Tight: related items (icon + label, avatar + name) |
| 12-16px | Medium: between groups within a section |
| 24-32px | Wide: between distinct sections |
| 48px+ | Vast: major page section breaks |

### Border Radius

Scale: `6px, inherit, 0px 0px 10px 10px, .3em, 1rem, 1px, 2px, 3px, 4px, 5px, 7px, 8px, 10px, 10px 10px 0px 0px, 12px, 14px, 16px, 20px, 22px, 100%, 400px`
Default: `7px`

### Container

Max-width: `1280px`, centered with auto margins.

### Breakpoints

| Name | Value |
|------|-------|
| sm | 640px |
| md | 641px |
| md | 768px |
| lg | 769px |
| lg | 928px |
| lg | 1024px |
| xl | 1025px |
| xl | 1140px |
| xl | 1240px |
| xl | 1280px |
| 2xl | 1281px |
| 2xl | 1420px |
| 2xl | 1440px |
| 2xl | 1536px |

Mobile-first: design for small screens, layer on responsive overrides.

## Component Patterns

### Card

```css
.card {
  background: #191d20;
  border: 1px solid #2a2e33;
  border-radius: 7px;
  padding: 16px;
  box-shadow: var(--shadow-medium);
}
```

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

### Button

```css
/* Primary */
.btn-primary {
  background: #7170ff;
  color: #ffffff;
  border-radius: 7px;
  padding: 8px 16px;
  font-weight: 500;
  transition: opacity 150ms ease;
}
.btn-primary:hover { opacity: 0.9; }

/* Ghost */
.btn-ghost {
  background: transparent;
  border: 1px solid #2a2e33;
  color: #ffffff;
  border-radius: 7px;
  padding: 8px 16px;
}
```

```html
<button class="btn-primary">Get Started</button>
<button class="btn-ghost">Learn More</button>
```

### Input

```css
.input {
  background: #080808;
  border: 1px solid #2a2e33;
  border-radius: 7px;
  padding: 8px 12px;
  color: #ffffff;
  font-size: 14px;
}
.input:focus { border-color: #7170ff; outline: none; }
```

```html
<input class="input" type="text" placeholder="Search..." />
```

### Badge / Chip

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #191d20;
  color: #6b6b6b;
}
```

```html
<span class="badge">New</span>
<span class="badge">Beta</span>
```

### Modal / Dialog

```css
.modal-backdrop { background: rgba(0, 0, 0, 0.6); }
.modal {
  background: #191d20;
  border: 1px solid #2a2e33;
  border-radius: 400px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0 4px 12px #00000026;
}
```

```html
<div class="modal-backdrop">
  <div class="modal">
    <h2>Dialog Title</h2>
    <p>Dialog content.</p>
    <button class="btn-primary">Confirm</button>
    <button class="btn-ghost">Cancel</button>
  </div>
</div>
```

### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 500;
  font-size: 12px;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #2a2e33;
}
.table td {
  padding: 12px;
  border-bottom: 1px solid #2a2e33;
}
```

```html
<table class="table">
  <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    <tr><td>Item One</td><td>Active</td><td>Jan 1</td></tr>
    <tr><td>Item Two</td><td>Pending</td><td>Jan 2</td></tr>
  </tbody>
</table>
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2e33;
}
.nav-link {
  color: #6b6b6b;
  padding: 8px 12px;
  border-radius: 7px;
  transition: color 150ms;
}
.nav-link:hover { color: #ffffff; }
.nav-link.active { color: #7170ff; }
```

```html
<nav class="nav">
  <a href="/" class="nav-link active">Home</a>
  <a href="/about" class="nav-link">About</a>
  <a href="/pricing" class="nav-link">Pricing</a>
  <button class="btn-primary" style="margin-left: auto">Get Started</button>
</nav>
```

### Extracted Components

These components were found in the codebase:

**Button** (`html`)

**Navigation** (`html`)

## Page Structure

The following page sections were detected:

- **Navigation** — Top navigation bar (9 items)
- **Hero** — Hero section (detected from heading structure)
- **Footer** — Page footer with links and info (43 items)

When building pages, follow this section order and structure.

## Animation & Motion

This project uses **expressive motion**. Animations are part of the design language.

### CSS Animations

- `_5pslva_fadeIn`
- `WinFxq_contextMenuIn`
- `WinFxq_contextMenuOut`
- `TZTsQG_mobileMenuIn`
- `TZTsQG_mobileMenuOut`

### Motion Tokens

- **Duration scale:** `0s`, `.1s`, `.15s`, `.25s`, `.3s`, `.35s`, `.5s`, `1.8s`, `2.5s`, `60ms`, `80ms`, `100ms`, `120ms`, `150ms`, `160ms`, `200ms`, `220ms`, `250ms`, `400ms`, `500ms`, `600ms`
- **Easing functions:** `ease-out`, `ease`, `cubic-bezier(.32,.72,0,1)`, `ease-in-out`, `linear`, `cubic-bezier(.43,.07,.59,.94)`, `cubic-bezier(.16,1,.3,1)`

### Motion Guidelines

- **Duration:** Use values from the duration scale above. Short (0s) for micro-interactions, long (600ms) for page transitions
- **Easing:** Use `ease-out` as the default easing curve
- **Direction:** Elements enter from bottom/right, exit to top/left
- **Reduced motion:** Always respect `prefers-reduced-motion` — disable animations when set

## Depth & Elevation

### Shadow Tokens

- Subtle: `-1px 0 0 0 var(--color),1px 0 0 0 var(--color)`
- Subtle: `0 1px #0006`
- Subtle: `0 0 0 1px #00000014,var(--shadow-low)`
- Subtle: `0 0 0 2px #0000001a`
- Subtle: `0 0 0 1px #0003`
- Subtle: `0 1.2px #00000008`

### Z-Index Scale

`0, 1, 10`

Use these exact values — never invent z-index values.

## Anti-Patterns (Never Do)

- **No blur effects** — no backdrop-blur, no filter: blur()
- **No zebra striping** — tables and lists use borders for separation
- **No invented colors** — every hex value must come from the palette above
- **No arbitrary spacing** — every dimension is a multiple of 4px
- **No extra fonts** — only Arial and Inter Variable and Berkeley Mono are allowed
- **No arbitrary border-radius** — use the scale: 6px, .3em, 1rem, 1px, 2px, 3px, 4px, 5px, 7px, 8px
- **No opacity for disabled states** — use muted colors instead

## Workflow

1. **Read** `references/DESIGN.md` before writing any UI code
2. **Pick colors** from the Color System section — never invent new ones
3. **Set typography** — Arial, Inter Variable, Berkeley Mono only, using the type scale
4. **Build layout** on the 4px grid — check every margin, padding, gap
5. **Match components** to patterns above before creating new ones
6. **Apply elevation** — use shadow tokens
7. **Validate** — every value traces back to a design token. No magic numbers.

## Brand Spec

- **Favicon:** `/favicon.ico`
- **Site URL:** `https://linear.app`
- **Brand color:** `#7170ff`
- **Brand typeface:** Arial

## Quick Reference

```
Background:     #080808
Surface:        #191d20
Text:           #ffffff / #6b6b6b
Accent:         #7170ff
Border:         #2a2e33
Font:           Arial
Spacing:        4px grid
Radius:         7px
Components:     7 detected
```

## When to Trigger

Activate this skill when:
- Creating new components, pages, or visual elements for linear
- Writing CSS, Tailwind classes, styled-components, or inline styles
- Building page layouts, templates, or responsive designs
- Reviewing UI code for design consistency
- The user mentions "linear" design, style, UI, or theme
- Generating mockups, wireframes, or visual prototypes

---

# Full Reference Files

> Every output file is embedded below. Claude has full design system context from /skills alone.

## Design System Tokens (DESIGN.md)

# linear DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 7
> Icon library: not detected · State: not detected
> Primary theme: dark · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![linear Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **dark-themed** interface with a cool tone. Depth is expressed through layered shadows and subtle surface color variation. Typography pairs **Inter Variable** for display/headings with **Arial** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. The palette is predominantly monochromatic with **#7170ff** as the single accent color — used sparingly for interactive elements and emphasis. Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| theme-color | `#080808` | background | Page background, darkest surface |
| border-faint-thin | `#191d20` | surface | Card and panel backgrounds |
| header-border | `#ffffff` | text-primary | Headings and body text |
| color-text-quaternary | `#6b6b6b` | text-muted | Captions, placeholders, secondary info |
| color-border-secondary | `#383b3f` | text-muted | Captions, placeholders, secondary info |
| color-text-secondary | `#d2d7de` | text-muted | Captions, placeholders, secondary info |
| color-text-secondary | `#b4bcd0` | text-muted | Captions, placeholders, secondary info |
| border-solid | `#2a2e33` | border | Dividers, card borders, outlines |
| color-accent | `#7170ff` | accent | CTAs, links, focus rings, active states |
| color-red | `#eb5757` | danger | Error states, destructive actions |
| color-link-primary | `#818fff` | info | Informational highlights |
| unknown | `#9c9da1` | unknown | Palette color |
| color-bg-tertiary | `#f4f2f4` | unknown | Palette color |
| unknown | `#4b4f54` | unknown | Palette color |
| color-button-invert-bg | `#e2e4e7` | unknown | Palette color |
| color-teal | `#02b8cc` | unknown | Palette color |
| unknown | `#585a5c` | unknown | Palette color |
| color-indigo | `#5e6ad2` | unknown | Palette color |
| color-text-tertiary | `#8b93a1` | unknown | Palette color |
| unknown | `#6366f1` | unknown | Palette color |

### CSS Variable Tokens

```css
--header-border: transparent;
--header-border: #ffffff14;
--header-border: #00000014;
--header-border: #ffffff14;
--header-border: #00000014;
--inner-card-border: 1px;
--label-muted: var(--color-text-quaternary);
--border-solid: #2a2e33;
--border-thin: #24282c;
--border-faint-thin: #191d21;
--border-frame: #151616;
--layer-popover: 600;
--border-hairline: 1px;
--border-hairline: .5px;
--header-border: #ffffff14;
--color-bg-primary: #08090a;
--color-bg-secondary: #1c1c1f;
--color-border-primary: #23252a;
--color-border-secondary: #34343a;
--color-border-tertiary: #3e3e44;
```


---

## 3. Typography Rules

**Font Stack:**
- **Arial** — Heading 1, Heading 2, Heading 3
- **Inter Variable** — Body, Caption
- **Berkeley Mono** — Code

**Font Sources:**

```css
@font-face {
  font-family: "Inter Variable";
  src: url("fonts/InterVariable-100.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Berkeley Mono";
  src: url("fonts/BerkeleyMono-100.woff2") format("woff2");
  font-weight: 100;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Arial | 40px | 700 |
| Heading 2 | Arial | 38px | 700 |
| Heading 3 | Arial | 2.25rem | 700 |
| Body | Inter Variable | 14px | 400 |
| Caption | Inter Variable | 13px | 400 |
| Code | Berkeley Mono | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **Arial** for body/UI text, **Inter Variable** for display/headings
- Maintain consistent hierarchy: no more than 3-4 font sizes per screen
- Headings use bold (600-700), body uses regular (400)
- Line height: 1.5 for body text, 1.2 for headings
- Use color and opacity for secondary hierarchy, not additional font sizes


---

## 4. Component Stylings

### Layout (1)

**Footer** — `html`

### Navigation (1)

**Navigation** — `html`

### Data Input (2)

**Button** — `html`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Media (3)

**Image** — `html`

**Icon** — `html`

**Map/Canvas** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** 6px, inherit, 0px 0px 10px 10px, .3em, 1rem, 1px, 2px, 3px, 4px, 5px, 7px, 8px, 10px, 10px 10px 0px 0px, 12px, 14px, 16px, 20px, 22px, 100%, 400px
- **Max content width:** 1280px

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Flat — subtle depth hints

- `-1px 0 0 0 var(--color),1px 0 0 0 var(--color)`
- `0 1px #0006`
- `0 0 0 1px #00000014,var(--shadow-low)`

### Raised — cards, buttons, interactive elements

- `var(--shadow-medium)`
- `0 0 0 2px var(--color-bg-primary),0 0 0 4px var(--color-brand-bg)`
- `inset 0 0 0 1px #ffffff08,inset 0 1px #ffffff0a,0 0 0 1px #0009,0 4px 4px #0000001a`

### Floating — dropdowns, popovers, modals

- `0 4px 12px #00000026`
- `inset 0 0 12px #0003`

### Overlay — full-screen overlays, top-level dialogs

- `0 8px 32px #08090a`
- `0 8px 32px #08090a0d`
- `0 4px 40px #0000001a,0 3px 20px #00000020,0 3px 12px #00000020,0 2px 8px #00000020,0 1px 1px #00000020`

### Z-Index Scale

`0, 1, 10`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes _5pslva_fadeIn`
- `@keyframes WinFxq_contextMenuIn`
- `@keyframes WinFxq_contextMenuOut`
- `@keyframes TZTsQG_mobileMenuIn`
- `@keyframes TZTsQG_mobileMenuOut`
- `@keyframes TZTsQG_slideFromRight`
- `@keyframes TZTsQG_slideFromLeft`
- `@keyframes TZTsQG_slideToRight`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#7170ff` for interactive elements (buttons, links, focus rings)
- Use `#080808` as the primary page background
- Pair **Arial** (body) with **Inter Variable** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 6px, inherit, 0px 0px 10px 10px, .3em, 1rem
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond Arial and Inter Variable and Berkeley Mono
- Don't use arbitrary spacing values — stick to multiples of 4px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

| Name | Value | Source |
|---|---|---|
| sm | 640px | css |
| md | 641px | css |
| md | 768px | css |
| lg | 769px | css |
| lg | 928px | css |
| lg | 1024px | css |
| xl | 1025px | css |
| xl | 1140px | css |
| xl | 1240px | css |
| xl | 1280px | css |
| 2xl | 1281px | css |
| 2xl | 1420px | css |
| 2xl | 1440px | css |
| 2xl | 1536px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #191d20
Border: 1px solid #2a2e33
Radius: 7px
Padding: 16px
Font: Arial
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #7170ff, text white
Ghost: bg transparent, border #2a2e33
Padding: 8px 16px
Radius: 7px
Hover: opacity 0.9 or lighter shade
Focus: ring with #7170ff
```

### Build a Page Layout

```
Background: #080808
Max-width: 1280px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #191d20
Label: #6b6b6b (muted, 12px, uppercase)
Value: #ffffff (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #080808
Input border: 1px solid #2a2e33
Focus: border-color #7170ff
Label: #6b6b6b 12px
Spacing: 16px between fields
Radius: 7px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: Arial, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```

## Bundled Fonts (fonts/)

The following font files are bundled in the `fonts/` directory:

- `fonts/BerkeleyMono-100.woff2`
- `fonts/InterVariable-100.woff2`

Use these local font files in `@font-face` declarations instead of fetching from Google Fonts.

## Homepage Screenshots (screenshots/)

![homepage.png](screenshots/homepage.png)

