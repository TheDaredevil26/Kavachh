# Kavach Frontend Design Specification

**Version:** 1.0  
**Date:** November 2026  
**Companion to:** Kavach (InsureGig) PRD v3.1 — this document **replaces PRD §13 (Frontend)** for everything visual, structural, and interaction-related. API contracts, SSE streams, and auth behaviour still come from the PRD (§5, §10, §12).  
**Stack:** React 18 (JavaScript / JSX) · Vite · Tailwind CSS 3 · framer-motion · lucide-react · react-router · react-i18next · html5-qrcode · event-source-polyfill  
**Scope:** (1) separate marketing **Landing site**, (2) **Worker app** — mobile first, responsive up to desktop, installable as a PWA, (3) **Admin console** — desktop first, usable on tablet  
**Not in scope (for now):** TypeScript, Docker / containerisation, CI/CD, native iOS/Android builds

---

## Table of Contents

1. [Brief & Audience](#1-brief--audience)
2. [Design Plan & Self-Review](#2-design-plan--self-review)
3. [Colour System](#3-colour-system)
4. [Typography](#4-typography)
5. [Glassmorphism System](#5-glassmorphism-system)
6. [Shape, Spacing, Elevation, Icons](#6-shape-spacing-elevation-icons)
7. [Motion & Haptics](#7-motion--haptics)
8. [Layout, Navigation & Responsive Behaviour](#8-layout-navigation--responsive-behaviour)
9. [Swipe Interactions](#9-swipe-interactions)
10. [Component Library](#10-component-library)
11. [Worker App Screens (Mobile First)](#11-worker-app-screens-mobile-first)
12. [Landing Site](#12-landing-site)
13. [Admin Console (Desktop First)](#13-admin-console-desktop-first)
14. [Copy, Language & Tone](#14-copy-language--tone)
15. [States: Loading, Empty, Error, Offline](#15-states-loading-empty-error-offline)
16. [Accessibility & Field Conditions](#16-accessibility--field-conditions)
17. [Performance Budget & PWA](#17-performance-budget--pwa)
18. [Project Structure](#18-project-structure)
19. [Screen-to-API Map](#19-screen-to-api-map)
20. [Quality Bar, QA Checklist & Build Order](#20-quality-bar-qa-checklist--build-order)

---

## 1. Brief & Audience

### 1.1 Who Uses This

Kavach's users are Q-Commerce delivery riders (Blinkit, Zepto, Swiggy Instamart) in Indian cities, working 8–12 hour shifts, mostly on mid-range or budget Android phones. They are not "insurance people": they open the app between orders, at a dark store, or under a shelter during rain. Admin users (claims reviewers) work at desks on laptops.

### 1.2 Field Conditions That Drive Every Decision

| Reality | Design consequence |
|---|---|
| One hand on the phone, often standing or on a bike | Primary actions live in the **bottom 40%** of the screen (thumb zone); no tiny targets; swipe instead of tap-and-confirm dialogs |
| Direct sunlight, glare | Black text on light surfaces only, ≥ 7:1 contrast for body text; no pale-grey-on-glass text; a one-tap **High Contrast** mode |
| Wet hands, gloves, vibration | Touch targets ≥ 56 px for primary actions, ≥ 48 px everywhere else; generous spacing; no precision gestures |
| Low-end Android, patchy 4G | Performance budget (§17), skeleton loaders, offline shell, **Data Saver** mode that removes blur and heavy motion |
| Regional languages | Every string translatable; fonts cover Devanagari, Tamil, Kannada, Telugu; layouts tolerate 40% longer text |
| Low insurance literacy | Plain words ("Money sent", not "Payout disbursed"), numbers in ₹, one idea per screen, status always visible |
| Anxiety about being cheated or rejected | Always show *what is happening* and *what happens next*; live status over silence |

### 1.3 The App's Three Jobs

1. **"Am I covered right now?"** — answered in under one second on the Home screen.
2. **"Something happened, get my money."** — one deliberate gesture (swipe) from alert to claim.
3. **"Where is my money?"** — a live, honest timeline from claim to bank.

Everything else (plans, history, profile) supports these three.

### 1.4 Quality Target

The finished product should feel like a shipped consumer app, not a student project. That is achieved through the details specified in this document: a strict token system, consistent glass surfaces, spring-based gestures with haptics, skeleton and empty states on every screen, live data without refreshes, and real attention to type, spacing, and copy. Section 20 lists the exact bar to hold before calling it done.

---

## 2. Design Plan & Self-Review

### 2.1 Compact Design Plan

**Color (base palette, 6 named values):** Oat `#EFE6D8` (canvas) · Sand `#E3D3BA` (warm surface) · Walnut `#5A4030` (brand accent, icons, progress, shield) · Powder `#D4E7F2` (cool surface) · Sky `#A8D2EC` (primary action) · Ink `#000000` (all text).

**Type:** *Bricolage Grotesque* for display and numbers, a distinctive variable grotesque with optical size and width axes; *Figtree* for interface text, friendly, open apertures, very legible outdoors; *Noto Sans* script families as fallbacks for Indic languages.

**Layout concept:** One glass "sheet" system floating over a living, soft background. On mobile, content is a single column of glass cards with a floating glass bottom bar and the primary action pinned in the thumb zone. On desktop, the same screens reflow into a rail + content + live-panel layout, and the app is shown framed inside the browser (not stretched).

**Signature element (where the boldness is spent):** the **Kavach shield thumb**. *Kavach* means armour. Every swipe-to-confirm uses a shield-shaped walnut thumb that slides along a glass track and locks into place on success. It is the one memorable, ownable object; everything else is quiet and disciplined. On the landing page it is also the hero: a live, swipeable demo of the claim gesture.

**Environment-reactive background (the only ambient motion):** the soft background mesh shifts hue with real conditions in the rider's zone (clear: warm beige; rain: blue-shifted; heat: honey-sand; bad air: muted stone). It changes slowly, once, when conditions change, and communicates state without adding UI.

**Principles:**
1. *One screen, one question.* Each screen answers a single question, with the answer in the largest type.
2. *Gesture for money, tap for everything else.* Anything that moves money or files a claim is a swipe; accidental taps cannot do harm.
3. *Never leave the rider guessing.* Every wait has a live status, an expected time, and a next step.
4. *Glass is for depth, never for reading.* Text sits on high-opacity glass over calm backgrounds; legibility beats effect, every time.
5. *Mobile is the product; desktop is the same product with more room.*

### 2.2 Self-Review Against Generic Defaults

The plan was checked against common templated outcomes and revised:

| Default that was avoided | What was chosen instead, and why |
|---|---|
| Warm cream background + serif display + terracotta accent | The beige palette is the brief's, so it stays, but the display face is a grotesque (no serif), the accent is **walnut brown and sky blue** rather than terracotta, and the danger colour is a cooler *madder rose*, not clay-orange |
| Identical rounded cards with the same grey shadow | A **radius hierarchy** (28 / 24 / 20 / 16 / pill) and **warm-tinted shadows** (walnut-based), with each elevation level used for a reason |
| Gradient washes as decoration | The background mesh *means* something (zone conditions) and is the only gradient |
| Tracked all-caps eyebrow labels above headings | None. Headings stand alone; sentence case throughout |
| Spaced "WORD — fragment" labels, middle-dot meta strings, arrows appended to buttons | None. Labels are plain; buttons say exactly what they do |
| Numbered 01 / 02 / 03 markers everywhere | Used **only** for "How it works" and the claim timeline, where the content is truly a sequence |
| Tinted near-black text (`#111`) | The brief asks for black text: text is true **`#000000`**, with secondary text as black at 72% opacity (8.3:1 on Oat) |
| Fade-and-slide-up on every section, hover effects on every card | Non-user-triggered motion is limited to the zone background shift and the landing hero demo; all other motion answers a gesture |

---

## 3. Colour System

### 3.1 Palette

| Token | Hex | Role | Black text on it |
|---|---|---|---|
| `oat` | `#EFE6D8` | App canvas (base background) | 17.0 : 1 |
| `sand` | `#E3D3BA` | Warm surfaces, selected states, tracks | 14.3 : 1 |
| `biscuit` | `#D2BC9A` | Dividers, strong borders, pressed states | 11.4 : 1 |
| `mocha` | `#8A6A4F` | Secondary icons, inactive accents | not used for text fills (4.3 : 1) |
| `walnut` | `#5A4030` | Brand accent: shield thumb, progress, key icons, focus ring | **never carries text** (2.2 : 1); icons 7.7 : 1 on Oat |
| `powder` | `#D4E7F2` | Cool surfaces, info panels, rain state | 16.5 : 1 |
| `sky` | `#A8D2EC` | **Primary action fill**, active tab pill, links background | 13.1 : 1 |
| `harbor` | `#5E9FC7` | Deeper blue for chart lines and live indicators | 7.3 : 1 |
| `ink` | `#000000` | **All text** | n/a |
| `sage` | `#A9D3A0` | Success (money sent, active cover) | 12.5 : 1 |
| `honey` | `#EBC15A` | Warning (under review, watch conditions) | 12.3 : 1 |
| `madder` | `#E07A7F` | Danger (rejected, failure) | 7.3 : 1 |

Contrast ratios were calculated against WCAG 2.1 formulas.

### 3.2 Usage Rules

1. **All text is black** (`ink`). Secondary text is `rgba(0,0,0,.72)`, never grey, never below 14 px. Disabled text is `rgba(0,0,0,.48)` and is allowed only on disabled controls.
2. **Walnut never carries text** (it fails contrast with black). Use it for icons, strokes, progress fills, the shield thumb, and focus rings. If a walnut surface needs a label, place the label next to it on glass.
3. **Primary action = Sky fill with black text.** One primary action per screen.
4. **Colour is never the only signal.** Every status pairs colour with an icon and a word (harbor-on-oat is only 2.3 : 1 for non-text, so blue alone cannot indicate "selected"; selected states also get a border, a check, or a filled pill).
5. **Status colours appear as tinted glass or pills** with black text, never as saturated blocks.
6. Maximum of **three hues visible per screen** (beige family + one blue + one status colour).

### 3.3 Status Colour Mapping

| Meaning | Colour | Icon | Used for |
|---|---|---|---|
| Covered / money sent / safe | `sage` | shield-check | Active policy, `paid`, `closed`, safe conditions |
| In progress / information | `sky` / `powder` | loader / info | `filed`…`payout_pending`, forecast notices |
| Needs attention / under review | `honey` | clock / eye | `held`, `disputed`, watch-level conditions, payout retry |
| Problem / not approved | `madder` | x-circle | `rejected`, `expired`, `payout_failed` |

### 3.4 Environment States (Background Mesh Tint)

| Zone condition | Mesh dominant tint | Trigger |
|---|---|---|
| Clear | Oat + Sand warmth, soft Sky corner | default |
| Rain | Powder and Sky dominate | `trigger.active` of type rainfall, or forecast ≥ 65% in next 3 h |
| Heat | Sand + Honey at 25% | heat trigger or feels-like ≥ 40 °C |
| Poor air | Sand + muted stone | AQI trigger or AQI ≥ 200 |
| Offline | Desaturated Oat | no network |

The mesh cross-fades over 1.2 s, only once per change.

### 3.5 CSS Variables

```css
/* src/styles/tokens.css */
:root {
  --oat: #EFE6D8;
  --sand: #E3D3BA;
  --biscuit: #D2BC9A;
  --mocha: #8A6A4F;
  --walnut: #5A4030;
  --powder: #D4E7F2;
  --sky: #A8D2EC;
  --harbor: #5E9FC7;
  --ink: #000000;
  --ink-2: rgba(0, 0, 0, 0.72);     /* secondary text, 8.3:1 on Oat */
  --ink-3: rgba(0, 0, 0, 0.48);     /* disabled only */

  --sage: #A9D3A0;
  --honey: #EBC15A;
  --madder: #E07A7F;

  --glass-1: rgba(255, 255, 255, 0.55);
  --glass-2: rgba(255, 255, 255, 0.70);
  --glass-border: rgba(255, 255, 255, 0.65);
  --glass-shadow: 0 8px 32px rgba(90, 64, 48, 0.12);

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

### 3.6 Tailwind Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        oat: '#EFE6D8', sand: '#E3D3BA', biscuit: '#D2BC9A',
        mocha: '#8A6A4F', walnut: '#5A4030',
        powder: '#D4E7F2', sky: '#A8D2EC', harbor: '#5E9FC7',
        ink: '#000000',
        sage: '#A9D3A0', honey: '#EBC15A', madder: '#E07A7F',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Noto Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', '"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Tamil"',
               '"Noto Sans Kannada"', '"Noto Sans Telugu"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sheet: '28px', hero: '24px', card: '20px', row: '16px', field: '14px' },
      boxShadow: {
        glass: '0 8px 32px rgba(90,64,48,0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
        float: '0 16px 48px rgba(90,64,48,0.18), inset 0 1px 0 rgba(255,255,255,0.8)',
        press: '0 2px 8px rgba(90,64,48,0.16)',
      },
      spacing: { 'safe-b': 'env(safe-area-inset-bottom, 0px)', 'safe-t': 'env(safe-area-inset-top, 0px)' },
      screens: { xs: '360px', sm: '480px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
      transitionTimingFunction: { spring: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
```

---

## 4. Typography

### 4.1 Typefaces

| Role | Family | Why |
|---|---|---|
| Display, headings, big numbers (₹ amounts, countdowns) | **Bricolage Grotesque** (variable) | A characterful grotesque with real personality at large sizes; its optical-size axis keeps numerals sturdy and readable small |
| Interface and body text | **Figtree** (variable) | Open, friendly, highly legible at small sizes and in glare; excellent numerals |
| Indic script fallbacks | **Noto Sans** Devanagari, Tamil, Kannada, Telugu | Full coverage for Hindi, Marathi, Tamil, Kannada, Telugu |

Install through `@fontsource-variable/*` packages (self-hosted, no third-party font requests, works offline in the PWA) and subset to the Latin plus the active language script. Always provide system fallbacks. Use `font-variant-numeric: tabular-nums` on every amount, countdown, and table figure.

### 4.2 Type Scale (Mobile; Desktop in Brackets)

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| Hero number | Display | 56 / 56 (72) | 800 | Payout amount, coverage left |
| Display | Display | 36 / 40 (56) | 800 | Landing headline, success screens |
| H1 | Display | 28 / 34 (36) | 700 | Screen titles |
| H2 | Display | 22 / 28 (26) | 700 | Card titles, section titles |
| H3 | Sans | 18 / 24 | 700 | List row titles |
| Body | Sans | 17 / 26 | 500 | Default reading text |
| Body strong | Sans | 17 / 26 | 700 | Key values in sentences |
| Caption | Sans | 14 / 20 | 600 | Hints, timestamps, secondary info (minimum size) |
| Button | Sans | 18 / 24 | 700 | All buttons |

Rules:
- **Minimum 16 px** for anything the rider must read; 14 px only for captions and timestamps.
- Medium weight (500) as the body default, because thin weights wash out in sunlight.
- Sentence case everywhere; no all-caps labels, no letter-spaced headings.
- Line length under 60 characters on mobile cards and under 75 on desktop; left-aligned text throughout (centre alignment only for single-line success states and the swipe label).
- Indic scripts: increase line-height by 0.1 (taller ascenders and matras need room).

---

## 5. Glassmorphism System

### 5.1 Principles

Glass here is a depth system, not a style filter. It gives hierarchy (what floats above what) while keeping text perfectly readable: glass surfaces are **high-opacity (55–70% white)** over a **calm, low-contrast background**, with a bright edge highlight and a warm shadow.

### 5.2 Glass Levels

| Level | Use | Background | Blur | Border | Shadow |
|---|---|---|---|---|---|
| `glass-1` | Cards, list groups, info panels | `rgba(255,255,255,.55)` | 20 px, saturate 140% | 1 px `rgba(255,255,255,.65)` | `glass` |
| `glass-2` | Floating UI: bottom nav, top bar, bottom sheets, modals | `rgba(255,255,255,.70)` | 28 px, saturate 150% | 1 px `rgba(255,255,255,.75)` | `float` |
| `glass-sky` | Info and primary context (active policy, rain alert) | `rgba(168,210,236,.45)` over `glass-1` | 20 px | 1 px `rgba(255,255,255,.6)` | `glass` |
| `glass-sand` | Warm context (history, profile groups) | `rgba(227,211,186,.45)` over `glass-1` | 20 px | 1 px `rgba(255,255,255,.6)` | `glass` |
| `glass-solid` | Fallback, Data Saver, forms where legibility is critical | `rgba(248,244,237,.96)` | none | 1 px `biscuit` at 60% | `press` |

Contrast check: black text on 55% white glass over Oat or Powder measures 17.7 : 1 to 19.2 : 1, and over Biscuit 16.2 : 1 (the darkest background).

### 5.3 Glass CSS

```css
/* src/styles/glass.css */
.glass-1 {
  background: var(--glass-1);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 32px rgba(90, 64, 48, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.glass-2 {
  background: var(--glass-2);
  -webkit-backdrop-filter: blur(28px) saturate(150%);
  backdrop-filter: blur(28px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow: 0 16px 48px rgba(90, 64, 48, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.glass-sky  { background: linear-gradient(rgba(168,210,236,.45), rgba(168,210,236,.45)), var(--glass-1); }
.glass-sand { background: linear-gradient(rgba(227,211,186,.45), rgba(227,211,186,.45)), var(--glass-1); }

/* Fallbacks: no backdrop-filter support, Data Saver, or reduced transparency preference */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-1, .glass-2, .glass-sky, .glass-sand { background: rgba(248, 244, 237, 0.96); }
}
.data-saver .glass-1, .data-saver .glass-2, .data-saver .glass-sky, .data-saver .glass-sand {
  -webkit-backdrop-filter: none; backdrop-filter: none;
  background: rgba(248, 244, 237, 0.96);
}
@media (prefers-reduced-transparency: reduce) {
  .glass-1, .glass-2 { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(248, 244, 237, 0.96); }
}
```

### 5.4 Background Mesh

Glass needs something to blur. The canvas is a fixed layer of soft radial gradients (not a blurred image, which is expensive):

```css
/* src/styles/background.css */
.app-bg {
  position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(60% 40% at 8% 0%,   var(--mesh-a, rgba(168,210,236,.80)) 0, transparent 70%),
    radial-gradient(50% 40% at 100% 22%, var(--mesh-b, rgba(212,231,242,.90)) 0, transparent 70%),
    radial-gradient(70% 50% at 0% 100%,  var(--mesh-c, rgba(210,188,154,.65)) 0, transparent 70%),
    var(--oat);
  transition: background 1.2s ease;
}
.app-bg[data-env="rain"] { --mesh-a: rgba(168,210,236,.95); --mesh-b: rgba(168,210,236,.70); --mesh-c: rgba(212,231,242,.90); }
.app-bg[data-env="heat"] { --mesh-a: rgba(235,193,90,.35);  --mesh-b: rgba(227,211,186,.90); --mesh-c: rgba(210,188,154,.75); }
.app-bg[data-env="air"]  { --mesh-a: rgba(210,200,185,.80); --mesh-b: rgba(227,211,186,.80); --mesh-c: rgba(190,180,165,.70); }
.app-bg[data-env="offline"] { filter: saturate(.4); }
```

The `data-env` attribute is set from the active trigger in the user's zone (SSE `trigger.announced`) and the forecast query.

### 5.5 Rules and Performance

1. **No more than three blurred surfaces on screen at once** (typical mobile: top bar, one or two cards, bottom bar). Long lists use `glass-1` on the *list container*, not each row, with plain dividers between rows.
2. **Never animate `backdrop-filter` or blur radius.** Animate transform and opacity only.
3. **Text on glass is always black** at the sizes in §4; never place text on the bare mesh without a glass surface, unless it is a large heading over a calm region.
4. **Forms use `glass-solid`** inputs with a 1.5 px biscuit border so typed text and cursors are crisp.
5. **Bottom sheets** use `glass-2` plus a dimming scrim (`rgba(90,64,48,.25)`) behind them.
6. On devices reporting low memory (`navigator.deviceMemory <= 2`), or when the user turns on **Data Saver**, apply the `.data-saver` class to `<html>`: glass becomes solid, mesh becomes a static two-stop gradient, large motion is disabled.

---

## 6. Shape, Spacing, Elevation, Icons

### 6.1 Radius Hierarchy

| Token | Value | Applied to |
|---|---|---|
| `rounded-sheet` | 28 px | Bottom sheets, modal sheets, phone-frame on desktop |
| `rounded-hero` | 24 px | The single hero card on a screen (active cover, claim summary) |
| `rounded-card` | 20 px | Standard glass cards |
| `rounded-row` | 16 px | List rows, buttons, chips with icons |
| `rounded-field` | 14 px | Inputs |
| `rounded-full` | pill | Swipe track, tab pill, status pills, avatars |

### 6.2 Spacing

An **8-pt grid** (4 px for fine-tuning). Screen padding 20 px on mobile (24 px ≥ 480 px, 32 px on desktop panels). Vertical rhythm between cards: 16 px; between sections: 28 px. The bottom of every scrolling screen has padding equal to the bottom bar height + safe area + 24 px so the last item is never hidden.

### 6.3 Elevation

Three levels only, always warm-tinted (never neutral grey):

| Level | Token | Use |
|---|---|---|
| Resting | `shadow-glass` | Cards |
| Floating | `shadow-float` | Bottom bar, sheets, toasts |
| Pressed | `shadow-press` | Pressed buttons and the held swipe thumb |

### 6.4 Iconography

- **lucide-react**, 24 px default (28 px in the bottom bar), stroke 2 px, rounded caps, colour `walnut` (active) or `mocha` (inactive).
- Every icon that carries meaning has a text label next to or below it. Icon-only buttons exist only for close/back, with an accessible name.
- Custom illustrations (landing and empty states) are flat SVG in the palette, with soft grain; no stock photography of workers. Weather glyphs are custom: rain, heat, air, curfew, store-outage.
- The **Kavach shield** is a custom SVG (rounded shield with a notch-less top edge) used as the logo, the swipe thumb, and the active-cover badge.

---

## 7. Motion & Haptics

### 7.1 Principle

Motion answers a gesture or explains a change; it is never decoration. The only non-user-triggered motion is the zone background shift and the landing hero demo.

### 7.2 Timing and Easing

| Type | Duration | Easing / physics |
|---|---|---|
| Micro feedback (press, toggle) | 100–150 ms | ease-out |
| Card and list changes | 220 ms | `cubic-bezier(.22,1,.36,1)` |
| Route transitions | 280 ms | Shared fade plus 12 px horizontal slide (forward: from right; back: from left) |
| Bottom sheet | spring, stiffness 380, damping 36 | Snap points at 40%, 90% of viewport height |
| Swipe thumb | spring, stiffness 500, damping 35 on release | See §9 |
| Number count-up (payout) | 900 ms | ease-out, tabular numerals so width never jitters |
| Background mesh shift | 1200 ms | linear cross-fade |

### 7.3 Specific Moments

| Moment | Behaviour |
|---|---|
| Swipe success | Thumb locks, shield "seals" (scale 1 → 1.12 → 1), track fills sage, check replaces label, light haptic |
| Money sent | Amount counts up from ₹0 to final value; a soft sage ring expands once behind it; double haptic |
| Timeline step reached (live) | The new step's dot fills with a short scale pulse; the line segment draws from the previous dot (stroke-dashoffset) |
| Trigger alert arrives (SSE) | The alert sheet rises from the bottom with spring; a single medium haptic; no sound unless the rider enabled it |
| Pull to refresh | Shield icon rotates with pull distance; release triggers refresh |
| Error | Single 6 px horizontal shake on the affected control, plus text explanation; never colour alone |

### 7.4 Haptics

Use `navigator.vibrate` where available (Android Chrome): `10` ms for selection, `[10, 30, 10]` for success, `30` ms for error. Wrap in a helper that respects the "Vibration" setting.

### 7.5 Reduced Motion

With `prefers-reduced-motion: reduce` or Data Saver: no springs, no count-up (show the final value), no mesh cross-fade (instant), route changes use a plain 120 ms fade, the landing demo shows a static state. Swipe still works because it is a direct manipulation, not an animation.

---
## 8. Layout, Navigation & Responsive Behaviour

### 8.1 Three Separate Surfaces

| Surface | Audience | Primary device | Deployment unit | Why separate |
|---|---|---|---|---|
| **Landing site** | Riders discovering Kavach, judges, recruiters, partners | Mobile first, polished on desktop | `frontend/landing` (static, SEO, tiny JS) | Fast first load, indexable, different job (persuade) from the app (operate) |
| **Worker app** | Riders with an account | **Mobile (primary)**, tablet, desktop web | `frontend/app` (PWA, installable) | The product itself |
| **Admin console** | Claims reviewers, tenant admins | Desktop first, tablet OK | Route group inside `frontend/app` (`/admin/*`), lazy-loaded | Shares auth, API layer, and components; never shipped to riders' bundles |

The three share one design-token package (`frontend/shared`) so the colours, glass, and type stay identical.

### 8.2 Worker App Route Map

| Route | Screen | Auth | Mobile nav visible |
|---|---|---|---|
| `/welcome` | Language pick and three intro slides | public | no |
| `/signup` | Multi-step registration (phone, details, platform) | public | no |
| `/login` | Phone and password | public | no |
| `/link-platform` | OAuth link to the delivery platform | worker | no |
| `/home` | Home: cover status, live conditions, recent activity | worker | yes |
| `/plans` | Plans carousel | worker | yes |
| `/plans/:tier` | Plan detail | worker | no (sticky action) |
| `/plans/:tier/activate` | Swipe to pay and activate | worker | no |
| `/alert/:triggerId` | Disruption alert and swipe to claim | worker | no |
| `/claims` | Claims list | worker | yes |
| `/claims/:id` | Live claim tracker | worker | no |
| `/claims/:id/dispute` | Open a dispute | worker | no |
| `/checkin` | Dark-store QR check-in | worker | no (full-screen camera) |
| `/notifications` | Notifications | worker | no |
| `/profile` | Profile and settings hub | worker | yes |
| `/profile/language`, `/profile/bank`, `/profile/help`, `/profile/accessibility` | Sub-pages | worker | no |

Admin routes: `/admin/login`, `/admin/queue`, `/admin/claims/:id`, `/admin/disputes`, `/admin/live`, `/admin/analytics`.

### 8.3 Responsive Strategy

| Breakpoint | Name | Layout |
|---|---|---|
| < 480 px | Mobile (design baseline 390 × 844; verify at 360 × 640) | Single column, floating bottom bar, sheets rise from the bottom, primary action in thumb zone |
| 480–767 px | Large mobile | Same as mobile, padding 24 px, cards max 520 px centred |
| 768–1023 px | Tablet | Two panes for list/detail screens (claims list left, tracker right); bottom bar becomes a floating left rail |
| ≥ 1024 px | Desktop web | **Three-zone layout**: left rail (glass-2, 88 px; labels on hover/expanded 240 px), centre content (max 720 px), right live panel (320 px: conditions, live claim timeline). Never a stretched phone layout |
| ≥ 1280 px | Wide desktop | Adds subtle outer margins and a wider right panel (360 px); content stays readable |

Rules:
- **Design mobile first**, then add layout at larger breakpoints with `md:` and `lg:` classes.
- Same components, same tokens; only arrangement changes.
- Desktop gets *more context*, not bigger controls: the right panel shows what mobile hides behind a tab.
- Hover states exist on desktop only (`@media (hover: hover)`); touch devices never depend on hover.

### 8.4 Mobile App Shell

```
┌──────────────────────────────────┐  ← status bar area (safe-top), theme-color Oat
│  Hi Rajan                  ● Live │  top bar: greeting, zone chip, connection dot
│  Koramangala                      │
├──────────────────────────────────┤
│                                  │
│        scrolling content         │  glass cards over the living background
│        (single column)           │
│                                  │
│                                  │
├──────────────────────────────────┤
│ ╭──────────────────────────────╮ │
│ │ Home   Plans  (QR)  Claims  Me│ │  floating glass-2 bottom bar, 72 px
│ ╰──────────────────────────────╯ │  + safe-bottom
└──────────────────────────────────┘
```

**Top bar:** transparent over the mesh, becomes `glass-2` after 8 px of scroll. Left: avatar initial + greeting + zone name. Right: connection dot (see §8.6).

**Bottom bar:** floating glass-2, 12 px side margin, 72 px high, radius full. Four tabs plus a raised centre action:

| Position | Item | Notes |
|---|---|---|
| 1 | Home | shield icon |
| 2 | Plans | layers icon |
| Centre | **Check in** | 64 px raised circle, sky fill, QR icon; opens camera |
| 4 | Claims | receipt icon, count badge when a claim is in progress |
| 5 | Me | user icon |

Active tab: a sky pill behind the icon and label (the label is always visible; inactive labels are ink at 72%). Active state is never colour alone: the pill plus a filled icon.

### 8.5 Desktop App Shell

```
┌──────┬───────────────────────────────────────────┬────────────────┐
│      │  Home                          ● Live     │  Right now     │
│ rail │ ┌───────────────────────────────────────┐ │ ┌────────────┐ │
│      │ │ Cover active · Standard               │ │ │ Rain  Safe │ │
│ Home │ └───────────────────────────────────────┘ │ │ Heat  Safe │ │
│ Plans│ ┌────────────────┐ ┌───────────────────┐  │ │ Air   Watch│ │
│ Claim│ │ Conditions     │ │ Recent activity   │  │ └────────────┘ │
│ Me   │ └────────────────┘ └───────────────────┘  │ ┌────────────┐ │
│      │                                           │ │ Live claim │ │
│ (QR) │                                           │ │ timeline   │ │
└──────┴───────────────────────────────────────────┴────────────────┘
```

### 8.6 Connection Indicator

A small dot plus word in the top bar reflects the SSE stream state:

| State | Dot | Word | Behaviour |
|---|---|---|---|
| Connected | sage | Live | Updates arrive instantly |
| Reconnecting | honey | Reconnecting | Auto-retry; on reopen, re-fetch status |
| Offline | madder | Offline | Banner explains: "You're offline. Your cover still works; we'll update when you reconnect." |

### 8.7 Thumb Zones (Mobile)

```
┌─────────────────┐
│  hard to reach  │  titles, status, read-only information
│                 │
│   reachable     │  cards, lists, secondary actions
│                 │
│  EASY (thumb)   │  swipe track, primary button, bottom bar
└─────────────────┘
```

Primary actions are pinned in a sticky glass-2 footer (`padding-bottom: safe-bottom + 16px`) in sub-flows, so the rider never scrolls to find them.

---

## 9. Swipe Interactions

Inspired by the "swipe to confirm" pattern in delivery-partner apps: a deliberate gesture replaces the tap-then-confirm dialog, so one motion both prevents accidents and feels fast.

### 9.1 Where Gestures Are Used

| Gesture | Where | Notes |
|---|---|---|
| **Swipe to confirm** (horizontal track) | Claim on disruption, activate and pay a plan, renew now | Core pattern, §9.2 |
| **Swipe to confirm, danger** (madder track, swipe right, extra confirm copy) | Cancel policy | Same component, `variant="danger"` |
| Horizontal snap carousel | Plans, intro slides, weekly summary cards | Native CSS `scroll-snap`, no JS needed |
| Draggable bottom sheet | Trigger alert, plan details, notifications filters | Snap points 40% and 90% |
| Swipe left on a list row | Claim row inside the dispute window reveals "Dispute"; notification row reveals "Dismiss" | Rows return on tap elsewhere |
| Pull to refresh | Home, Claims, Notifications | Shield icon rotates with pull distance |

### 9.2 Swipe-to-Confirm Specification

**Anatomy (mobile):**

```
┌──────────────────────────────────────────────────┐
│ (🛡 >>)   Swipe to claim ₹350                    │   track: 64 px high, pill, glass-1
└──────────────────────────────────────────────────┘   thumb: 56 px shield, walnut, 4 px inset
```

| Property | Value |
|---|---|
| Track | Height 64 px, full width minus screen padding, radius pill, `glass-1` with a 1.5 px biscuit inner stroke |
| Thumb | 56 × 56 px shield (walnut fill, white chevrons icon), 4 px inset, `shadow-press` while held |
| Label | Centred, 18/700 black, 3 words maximum plus the amount ("Swipe to claim ₹350"); fades out as the thumb advances |
| Progress fill | Sky tint grows behind the thumb with the drag distance; turns sage on success |
| Commit threshold | Released at ≥ 85% of track travel, or with velocity > 700 px/s beyond 50% |
| Cancel | Released earlier springs back (stiffness 500, damping 35); selection haptic on pick-up |
| Hint | If untouched for 4 s on screen, the thumb nudges 12 px and returns, up to 3 times |

**States:**

| State | Visual | Behaviour |
|---|---|---|
| Idle | Thumb at left, label visible | Draggable |
| Dragging | Fill follows thumb, label fades | `touch-action: pan-y` on the track so vertical scroll still works |
| Committing | Thumb snaps to the right edge, light haptic | Locks; spinner replaces the chevrons |
| Success | Track fills sage, thumb becomes a check, label: "Claim sent" | Success haptic; then navigates to the live tracker |
| Error | Thumb returns left, error pill under the track in plain words | Retry by swiping again; the request is idempotent (PRD §5.5 `Idempotency-Key`) so a repeat can never double-file |
| Disabled | Track in sand at 60%, thumb greyed, label explains why | Example: "Opens when the rain alert starts" |

**Safety:** the swipe is the *only* control for money-moving actions, but the route behind it is protected by the same idempotency, state-machine, and lock guarantees as the PRD; the gesture is UX, not security.

**Accessibility:**
- The track is `role="button"` with `aria-label="Claim 350 rupees. Swipe, or press Enter to confirm"`.
- Keyboard: focus with Tab; **Enter** or **Space** triggers the confirm, with a visible walnut focus ring.
- Settings > Accessibility has **Use a button instead of swiping**: replaces the track with a 64 px Sky button that needs a 1.5 s press-and-hold (progress ring fills), still preventing accidental taps.
- Screen readers announce the state changes ("Sending claim", "Claim sent") via an `aria-live="polite"` region.

### 9.3 Reference Implementation

```jsx
// src/components/SwipeToConfirm.jsx
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronsRight, Check, Loader2 } from 'lucide-react';
import { haptic } from '../lib/haptics';

const THUMB = 56;
const INSET = 4;
const THRESHOLD = 0.85;

export default function SwipeToConfirm({
  label,
  successLabel = 'Done',
  onConfirm,          // async () => void ; throw to signal failure
  disabled = false,
  disabledReason = '',
  variant = 'primary', // 'primary' | 'danger'
}) {
  const trackRef = useRef(null);
  const x = useMotionValue(0);
  const [maxX, setMaxX] = useState(240);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [error, setError] = useState('');

  useEffect(() => {
    const measure = () => setMaxX((trackRef.current?.offsetWidth ?? 300) - THUMB - INSET * 2);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Idle hint: nudge the thumb up to 3 times if the rider has not touched it
  useEffect(() => {
    if (disabled || status !== 'idle') return;
    let count = 0;
    const id = setInterval(() => {
      if (count++ >= 3 || x.get() > 0) return clearInterval(id);
      animate(x, [0, 12, 0], { duration: 0.6 });
    }, 4000);
    return () => clearInterval(id);
  }, [disabled, status, x]);

  const labelOpacity = useTransform(x, [0, maxX * 0.35], [1, 0]);
  const fillWidth = useTransform(x, (v) => v + THUMB + INSET * 2);

  async function commit() {
    animate(x, maxX, { type: 'spring', stiffness: 400, damping: 40 });
    haptic('selection');
    setStatus('loading');
    try {
      await onConfirm();
      setStatus('success');
      haptic('success');
    } catch (e) {
      setError(e?.message || 'Something went wrong. Nothing was charged. Try again.');
      haptic('error');
      setStatus('error');
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
      setTimeout(() => setStatus('idle'), 400);
    }
  }

  function handleDragEnd(_, info) {
    if (status !== 'idle') return;
    const progress = x.get() / maxX;
    if (progress >= THRESHOLD || (progress > 0.5 && info.velocity.x > 700)) commit();
    else animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
  }

  function handleKey(e) {
    if (disabled || status !== 'idle') return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(); }
  }

  const fillColor = status === 'success' ? 'bg-sage' : variant === 'danger' ? 'bg-madder/60' : 'bg-sky';

  return (
    <div>
      <div
        ref={trackRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={`${label}. Swipe, or press Enter to confirm`}
        onKeyDown={handleKey}
        className={`relative h-16 w-full select-none overflow-hidden rounded-full glass-1
          ring-1 ring-biscuit/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-walnut
          ${disabled ? 'opacity-60' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        <motion.div className={`absolute inset-y-0 left-0 rounded-full ${fillColor}`} style={{ width: fillWidth }} />

        <motion.span
          className="absolute inset-0 flex items-center justify-center px-20 text-center font-bold text-[18px] text-ink"
          style={{ opacity: status === 'idle' ? labelOpacity : 1 }}
        >
          {disabled ? disabledReason : status === 'success' ? successLabel : status === 'loading' ? 'Sending…' : label}
        </motion.span>

        {!disabled && (
          <motion.div
            drag={status === 'idle' ? 'x' : false}
            dragConstraints={{ left: 0, right: maxX }}
            dragElastic={0}
            dragMomentum={false}
            onDragStart={() => haptic('selection')}
            onDragEnd={handleDragEnd}
            style={{ x, width: THUMB, height: THUMB, left: INSET, top: INSET }}
            className="absolute flex items-center justify-center rounded-row bg-walnut text-white shadow-press active:shadow-press"
            whileTap={{ scale: 1.04 }}
          >
            {status === 'loading' ? <Loader2 className="animate-spin" size={26} />
              : status === 'success' ? <Check size={26} />
              : <ChevronsRight size={26} />}
          </motion.div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {status === 'loading' ? 'Sending' : status === 'success' ? successLabel : ''}
      </p>
      {status === 'error' || error ? (
        <p className="mt-3 rounded-row bg-madder/30 px-4 py-3 text-[15px] font-semibold text-ink">{error}</p>
      ) : null}
    </div>
  );
}
```

> The thumb uses the shield SVG in production; the `rounded-row` square above is a placeholder so the component runs before the logo asset exists. Clear `error` when the rider starts a new swipe.

```javascript
// src/lib/haptics.js
const PATTERNS = { selection: 10, success: [10, 30, 10], error: 30 };

export function haptic(kind) {
  if (localStorage.getItem('kavach_vibration') === 'off') return;
  navigator.vibrate?.(PATTERNS[kind] ?? 10);
}
```

### 9.4 Other Gestures

| Gesture | Implementation notes |
|---|---|
| Snap carousel | CSS: `overflow-x: auto; scroll-snap-type: x mandatory;` children `scroll-snap-align: center`; peek 24 px of the next card to signal swipeability; page dots below |
| Bottom sheet | framer-motion `drag="y"` with snap points; dragging past 120 px down or velocity > 500 px/s dismisses; handle bar 40 × 5 px at the top; scrim tap also dismisses |
| Swipe-left row actions | Row translates up to 88 px revealing the action (a 56 px-high Sky or Madder tile with icon and word); haptic selection at the reveal threshold |
| Pull to refresh | Only when scrolled to the top; threshold 72 px; shows skeleton shimmer for at least 400 ms so refresh feels real |
| Back swipe | Native browser/OS edge swipe; routes must not break it (no custom edge gestures) |

---

## 10. Component Library

### 10.1 Inventory

| Component | Variants / notes |
|---|---|
| `Button` | `primary` (Sky, black text), `secondary` (glass-1, black text), `ghost` (text only, underlined on focus), `danger` (madder tint, black text). Height 56 px (48 px compact), radius row, font 18/700. Pressed: translateY(1px) plus `shadow-press` |
| `SwipeToConfirm` | See §9 |
| `GlassCard` | `level` 1 / 2, `tint` none / sky / sand, `radius` card / hero |
| `HeroCard` | The single dominant card per screen (active cover, claim summary), radius hero, glass-sky |
| `ListGroup` and `ListRow` | One glass container, rows separated by 1 px biscuit at 40%; row min-height 64 px; leading icon in a 40 px sand circle; trailing value or chevron |
| `StatusPill` | Colour + icon + word (see §3.3); height 32 px, radius full, 14/700 text |
| `ConditionTile` | Icon, name ("Rain"), current value, state pill (Safe / Watch / Triggered), mini sparkline for the last 3 h |
| `CoverageRing` | 96 px ring, walnut stroke on sand track, centre shows "₹1,050 left" in Display; animates on change |
| `PlanCard` | Tier name, weekly price (Hero number), three bullets, "Most chosen" marker on Standard (only if backed by data), select button |
| `Timeline` | Vertical, live (see §10.3) |
| `TopBar`, `BottomNav`, `SideRail` | §8 |
| `Sheet` | Draggable bottom sheet (mobile) / centred modal (desktop ≥ 1024) |
| `Toast` | glass-2 pill at the top, 3.5 s, swipe up to dismiss; icon plus plain sentence; never the only record of an important event |
| `TextField`, `OtpField`, `Select`, `Toggle` | glass-solid, 56 px high, 1.5 px biscuit border, label above (always visible, never placeholder-only), error text below with icon |
| `Stepper` | Registration progress: 3 segments, current filled walnut |
| `Skeleton` | Sand-on-oat shimmer shapes matching the final layout |
| `EmptyState` | Illustration (SVG), one-sentence explanation, one action |
| `ConnectionDot` | §8.6 |
| `Banner` | Full-width glass-sky, glass-sand (warning), or madder tint, with an icon and a single action |

### 10.2 Button

```jsx
// src/components/Button.jsx
const VARIANTS = {
  primary:   'bg-sky text-ink shadow-glass hover:brightness-95',
  secondary: 'glass-1 text-ink',
  ghost:     'bg-transparent text-ink underline-offset-4 focus-visible:underline',
  danger:    'bg-madder/40 text-ink ring-1 ring-madder',
};

export default function Button({ variant = 'primary', compact = false, icon: Icon, children, loading, ...props }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-row font-sans text-[18px] font-bold
        transition active:translate-y-px active:shadow-press disabled:opacity-50
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-walnut
        ${compact ? 'h-12 px-4' : 'h-14 px-6'} ${VARIANTS[variant]} ${props.className ?? ''}`}
    >
      {Icon && <Icon size={22} aria-hidden="true" />}
      {loading ? 'Please wait…' : children}
    </button>
  );
}
```

### 10.3 Claim Timeline (Live)

The tracker maps the PRD's 7-state machine to rider-friendly words. It updates from the SSE stream without a refresh (PRD §12.3).

| Backend state | Rider sees | Sub-text | Pill |
|---|---|---|---|
| `filed` | Claim received | We have your claim. | sky |
| `validated` | Cover checked | Your plan covers this event. | sky |
| `scoring` | Verifying | Quick safety check, usually a few seconds. | sky |
| `decided` | Approved | Your payout amount is set. | sage |
| `payout_pending` | Sending money | Transferring to your bank account. | sky |
| `paid` | Money sent | Reached your bank. You can raise a problem for 2 hours. | sage |
| `closed` | All done | This claim is complete. | sage |
| `held` | Under review | A person is checking this. You'll hear back within 24 hours. | honey |
| `rejected` | Not approved | See why below. You can contact support. | madder |
| `disputed` | Dispute in review | We're looking at your dispute. | honey |
| `payout_failed` | Payment retrying | Your bank didn't accept it. We're trying again. | honey |
| `expired` | Closed without payout | This claim timed out. | madder |
| `cancelled` | Cancelled | | sand |

Visual rules: a vertical line with 24 px dots; reached steps filled walnut with a check, the current step has a sky ring and a live pulse, future steps are empty biscuit circles. Held, rejected, and similar branch states **replace the "next" steps** with a single clearly-labelled branch card instead of showing greyed steps that will never happen. Fraud scores, signals, and confidence are never shown to riders.

---
## 11. Worker App Screens (Mobile First)

Every screen below lists the question it answers, a mobile wireframe, how it reflows on tablet/desktop, its states, and the copy. Wireframes are 390 px wide; `glass` cards are drawn with box borders.

### 11.1 Welcome and Language (`/welcome`)

**Question it answers:** "What is this, and can I use it in my language?"

```
┌──────────────────────────────┐
│                              │
│          [shield logo]       │
│                              │
│  Pick your language          │  H1
│  ┌────────────────────────┐  │
│  │ English                │  │  glass-1 rows, 64 px, native script names
│  │ हिन्दी                   │  │
│  │ தமிழ்                    │  │
│  │ ಕನ್ನಡ                    │  │
│  │ తెలుగు                   │  │
│  │ मराठी                    │  │
│  └────────────────────────┘  │
│                              │
│  [        Continue        ]  │  primary, thumb zone
└──────────────────────────────┘
```

Then three swipeable intro slides (snap carousel, dots, "Skip" at the top right):

| Slide | Headline | Support line |
|---|---|---|
| 1 | Rain stops orders. Not your pay. | When bad weather cuts your work, Kavach pays you. |
| 2 | No forms. No waiting in line. | We watch rain, heat, air, curfews, and store outages for you. |
| 3 | One swipe, money in your bank. | Swipe to claim. Watch it arrive, live. |

Final slide button: **Create account** (primary) and **I already have an account** (ghost). Desktop: a centred 480 px glass card over the mesh with the logo on the left half.

### 11.2 Sign Up (`/signup`, three steps)

**Question:** "Can I get started in under two minutes?" Stepper at top (3 segments).

```
Step 1 of 3                          Step 2 of 3                          Step 3 of 3
┌─────────────────────────┐          ┌─────────────────────────┐          ┌─────────────────────────┐
│ Your phone number       │          │ Where do you deliver?   │          │ Link your Blinkit       │
│ [+91 | 98765 43210    ] │          │ [ Name              ]   │          │ account                 │
│                         │          │ Platform                │          │                         │
│ Create a password       │          │ (Blinkit)(Zepto)(Insta) │          │ This confirms you work  │
│ [ ••••••••     ] show   │          │ Rider ID  [ BLK-... ]   │          │ with them. We never see │
│ 8+ characters           │          │ Pincode   [ 560034 ]    │          │ your password.          │
│                         │          │ Area: Koramangala ✓     │          │                         │
│ [      Next        ]    │          │ [      Next        ]    │          │ [ Link with Blinkit ]   │
└─────────────────────────┘          └─────────────────────────┘          └─────────────────────────┘
```

- One thing per step, large fields (56 px), numeric keypad (`inputmode="numeric"`) for phone and pincode.
- Platform choice is a segmented chip row using **text names only** (no third-party logos).
- Pincode resolves to the zone name inline; the zone is confirmed with a check.
- Step 3 starts the OAuth link (PRD §10.2). On return, a success state shows the shield sealing and "Linked", then **Go to Home**.
- Errors appear under the field with an icon: "That number is already registered. Log in instead."
- After sign-up, Home shows a Banner: "Add your bank account to receive money" until verified.

### 11.3 Log In (`/login`)

Phone, password, **Log in** (primary), "Forgot password" ghost link. Biometric unlock (WebAuthn) is a later enhancement; v1 keeps the session for 7 days via the refresh token (PRD §10.1) so riders rarely see this screen.

### 11.4 Home (`/home`)

**Question:** "Am I covered right now, and is anything happening?"

```
┌──────────────────────────────┐
│ Hi Rajan                ● Live│  top bar
│ Koramangala                  │
│                              │
│ ┌──────────────────────────┐ │  HeroCard, glass-sky, radius hero
│ │ [shield] Cover active    │ │
│ │          Standard plan   │ │
│ │                          │ │
│ │  ( ring )   ₹1,050       │ │  CoverageRing + Hero number
│ │             left this    │ │
│ │             month        │ │
│ │ Renews 23 Nov. Auto-renew on│
│ └──────────────────────────┘ │
│                              │
│ Right now in your area       │  H2
│ ┌────────┐┌────────┐┌──────┐ │  horizontal scroll-snap tiles
│ │ Rain   ││ Heat   ││ Air  │ │
│ │ 0 mm/h ││ 31 °C  ││ AQI  │ │
│ │ ✓ Safe ││ ✓ Safe ││ Watch│ │
│ └────────┘└────────┘└──────┘ │
│                              │
│ ┌──────────────────────────┐ │  glass-sand
│ │ [QR] Arrived at your store?│ │
│ │ Check in to strengthen    │ │
│ │ your claims.   [Scan QR] │ │
│ └──────────────────────────┘ │
│                              │
│ Recent                       │
│ ┌──────────────────────────┐ │
│ │ Rain event      ₹350 Paid│ │
│ │ Yesterday                │ │
│ │ Heat event    Under review│ │
│ └──────────────────────────┘ │
│  ╭────────────────────────╮  │
│  │ Home Plans (QR) Claims Me│  │
│  ╰────────────────────────╯  │
└──────────────────────────────┘
```

**Hero card variants:**

| Situation | Hero shows | Primary action |
|---|---|---|
| Active cover | "Cover active", plan name, coverage ring, renewal date | None needed |
| Waiting period | "Cover starts in 2 days 5 hours" with a progress bar (72 h) | "See what's covered" |
| No plan | "You're not covered yet" with a shield outline | **See plans** (primary) |
| Plan expired | "Your cover ended" | **Renew** |
| Bank not added | Banner above hero | **Add bank account** |

**Live disruption (the key moment):** when `trigger.announced` arrives for the rider's zone and they hold active cover, a glass-2 **claim dock** appears above the bottom bar with the swipe track ("Rain started. Swipe to claim ₹350"). The background mesh shifts to the rain tint. Tapping the dock body opens the full alert sheet (§11.8).

**Desktop:** hero and conditions form a two-column grid; the right panel shows the live claim timeline and conditions list.

**Skeleton:** hero-shaped shimmer, three tile shimmers, three row shimmers.

### 11.5 Plans (`/plans`) and Plan Detail

**Question:** "Which plan is right for me, and what will it cost?"

```
┌──────────────────────────────┐
│ Choose your weekly cover     │  H1
│ Pay weekly. Cancel anytime.  │
│                              │
│  ┌───────────┐ ┌───────────┐ │  snap carousel, next card peeks
│  │ Basic     │ │ Standard  │ │
│  │ ₹49       │ │ ₹89       │ │  Hero number, per week
│  │ a week    │ │ a week    │ │
│  │           │ │           │ │
│  │ ₹200 per  │ │ ₹350 per  │ │
│  │ event     │ │ event     │ │
│  │ 3 days a  │ │ 4 days a  │ │
│  │ month     │ │ month     │ │
│  │ [Select]  │ │ [Select]  │ │
│  └───────────┘ └───────────┘ │
│    ● ○ ○                     │
└──────────────────────────────┘
```

| Plan | Weekly price | Per event | Days a month |
|---|---|---|---|
| Basic | ₹49 | ₹200 | 3 |
| Standard | ₹89 | ₹350 | 4 |
| Premium | ₹129 | ₹500 | 6 |

Details come from `GET /policies/tiers`; prices and limits are never hard-coded in the UI. The selected card gets a walnut 2 px border and a check (not colour alone). Do not show a "most popular" badge unless real usage data supports it.

**Plan detail** (sheet at 90% height): what is covered (rain, heat, air quality, curfew, store outage, each with its icon and plain-language threshold, e.g. "Heavy rain"), what happens (we detect, you swipe, money arrives), the 72-hour waiting period explained in one sentence, and a sticky **Continue** button.

### 11.6 Activate Plan (`/plans/:tier/activate`)

**Question:** "What am I paying and when does it start?"

```
┌──────────────────────────────┐
│ ‹  Confirm your plan         │
│                              │
│ ┌──────────────────────────┐ │
│ │ Standard                 │ │
│ │ ₹89 a week               │ │
│ │ Up to ₹350 per event     │ │
│ │ Cover starts in 3 days   │ │  (72-hour waiting period)
│ │ Auto-renew        [ on ] │ │  Toggle
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ (🛡>>)  Swipe to pay ₹89  │ │  SwipeToConfirm
│ └──────────────────────────┘ │
│  By swiping you agree to the │
│  plan terms.                 │
└──────────────────────────────┘
```

Success: shield seals, "Plan active. Cover starts Wed 18 Nov", button **Go to Home**. Error `PLATFORM_NOT_LINKED` shows a banner with **Link your platform**; `POLICY_ALREADY_ACTIVE` shows "You already have an active plan."

### 11.7 Disruption Alert and Claim (`/alert/:triggerId`)

**Question:** "Something happened. Do I get paid, and how do I claim?" Opens automatically (full-height `glass-2` sheet) from the live event, a push notification, or the claim dock.

```
┌──────────────────────────────┐
│ ━━━                          │  sheet handle
│ [rain glyph]                 │
│ Heavy rain in Koramangala    │  H1
│ Started 6:34 pm              │  Caption
│                              │
│ ┌──────────────────────────┐ │
│ │ You can claim            │ │  glass-sky
│ │ ₹350                     │ │  Hero number (count-up on open)
│ │ Standard plan, per event │ │
│ └──────────────────────────┘ │
│                              │
│ We use your location and     │
│ store check-in to confirm    │
│ you were working.            │
│                              │
│ ┌──────────────────────────┐ │
│ │ (🛡>>)  Swipe to claim    │ │
│ └──────────────────────────┘ │
│ Not now                      │  ghost
└──────────────────────────────┘
```

- Swiping calls `POST /claims` with the trigger, policy, and current GPS position, plus an `Idempotency-Key`. On success, the sheet transitions into the claim tracker (shared element: the amount).
- Location permission is requested **only here**, with a pre-permission explanation: "Allow location so we can confirm you're in the affected area." If denied, the swipe is still possible and the explanation says a store check-in can help.
- Pre-alert (forecast) variant: informational only, no swipe: "Rain expected 3–6 pm tomorrow. You're covered. Estimated protection ₹350." with a **Remind me** toggle.
- Not covered variants: "Your plan doesn't cover this" (with plan upgrade link), "Cover starts in 1 day" (waiting period), "Limit reached for this month".

### 11.8 Live Claim Tracker (`/claims/:id`)

**Question:** "Where is my money?" The most-viewed screen after a disruption; it must feel alive.

```
┌──────────────────────────────┐
│ ‹  Your claim                │
│                              │
│ ┌──────────────────────────┐ │
│ │ Rain event, 17 Nov       │ │  HeroCard
│ │ ₹350                     │ │  Hero number
│ │ [● Sending money]        │ │  StatusPill (live)
│ └──────────────────────────┘ │
│                              │
│  ● Claim received    2:40 pm │  Timeline, live
│  ● Cover checked     2:40 pm │
│  ● Verifying         2:40 pm │
│  ● Approved          2:40 pm │
│  ◉ Sending money     2:40 pm │  current: sky ring + pulse
│  ○ Money sent                │
│                              │
│  Usually under 15 minutes.   │
│                              │
│ ┌──────────────────────────┐ │  appears after "Money sent"
│ │ Something wrong?  1:58 left│ │  dispute window countdown (2 h)
│ │ [Raise a problem]        │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- Updates arrive over the `claims` SSE stream (PRD §5.6). On reconnect the screen re-fetches status so no step is missed.
- **Payout complete:** amount counts up once, the sage ring expands, a double haptic fires, and the bank reference is shown in a small copyable row.
- **Under review (`held`):** the timeline collapses to a honey branch card: "A person is checking this. You'll hear back within 24 hours." plus **Contact support**. No fraud language, no scores.
- **Not approved:** a madder-tinted card with the reason in plain words and **Contact support**.
- **Dispute window:** after `paid`, a countdown card shows the time left in the 2-hour window with **Raise a problem**; after it ends, the card is replaced by "All done".
- **Desktop:** the timeline lives in the right panel on the Home screen and in the centre on this screen.

### 11.9 Claims List (`/claims`)

**Question:** "What have I claimed before?" A `ListGroup` grouped by month; each row shows event icon, event name and date, amount, and a status pill. A claim in progress is pinned at the top with its live status. Swipe left on a row inside its dispute window reveals **Raise a problem**. Filter chips: All, In progress, Paid, Not paid. Empty state: illustration of a quiet sky, "No claims yet. When bad weather hits, your claims will show up here." On tablet/desktop the list sits on the left and the tracker on the right.

### 11.10 Raise a Problem (`/claims/:id/dispute`)

Only available while `paid` and inside the 2-hour window (PRD §5.5). A sheet with a short reason picker (chips: "Amount is wrong", "I was working during the event", "Money didn't arrive", "Something else") and an optional text field, then **Send** (primary). Success: "We got it. A person will review within 24 hours." If the window has closed: "The time to raise a problem has passed. Contact support." with a support link.

### 11.11 Store Check-In (`/checkin`)

**Question:** "Did the store register that I'm here?" Full-screen camera (html5-qrcode) with a glass-2 overlay frame and a bottom glass card.

```
┌──────────────────────────────┐
│ ✕                            │
│                              │
│      ┌──────────────┐        │
│      │              │        │  scan frame, walnut corners
│      │   (camera)   │        │
│      └──────────────┘        │
│                              │
│ ┌──────────────────────────┐ │
│ │ Scan the QR at your store │ │
│ │ It changes every 5 minutes│ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

| Result | Message |
|---|---|
| Success | "Checked in at Koramangala store, 6:12 pm" with the shield sealing |
| QR expired | "That code has expired. Scan the current one on the screen." |
| Already used | "This code was already scanned. Scan the current code." |
| Wrong platform | "This store is not on your platform." |
| Too far | "You're too far from the store. Move closer and scan again." |
| Camera denied | Explanation plus **Open settings** instructions |

### 11.12 Notifications (`/notifications`)

Grouped list (Today, Earlier). Types: alert (rain expected), claim update, payout, plan (renewing soon). Swipe left to dismiss; tapping opens the related screen. Empty state: "You're all caught up."

### 11.13 Profile and Settings (`/profile`)

```
┌──────────────────────────────┐
│ [R]  Rajan Kumar             │
│      Blinkit, Koramangala    │
│                              │
│ ┌──────────────────────────┐ │
│ │ Bank account  ••••4821  ›│ │
│ │ Language     English    ›│ │
│ │ Accessibility           ›│ │
│ │ Help and support        ›│ │
│ └──────────────────────────┘ │
│ [   Log out   ]  secondary   │
└──────────────────────────────┘
```

**Accessibility page:** High contrast (solid backgrounds, thicker borders), **Data Saver** (no blur, minimal motion), Larger text (100 / 115 / 130%), Vibration on/off, **Use a button instead of swiping**. Settings apply instantly and persist locally.

---
## 12. Landing Site

A separate, static, fast-loading site whose job is to **show what Kavach is and persuade**, for riders, and as a showcase for reviewers, recruiters, and hackathon judges. It lives in `frontend/landing` and is built independently from the app.

### 12.1 Goals

1. A rider understands Kavach in 10 seconds and taps **Get started**.
2. A reviewer sees the product's craft: the live swipe demo, the glass system, and the engineering summary.
3. Search and social previews are good (SEO, Open Graph).

### 12.2 Page Structure

| # | Section | Content | Notes |
|---|---|---|---|
| 1 | Floating nav | Logo, How it works, Coverage, Plans, FAQ, language switch, **Get started** | `glass-2` pill; collapses to logo + button + menu sheet on mobile |
| 2 | **Hero** | Headline, one supporting line, two buttons, **live swipe demo in a phone frame** | The signature moment, §12.3 |
| 3 | What Kavach does, in facts | Three plain facts: "Watches 5 kinds of disruption", "Pays by bank transfer in minutes", "Plans from ₹49 a week" | Product facts only; **no invented user numbers** |
| 4 | How it works | Three steps (a true sequence, so numbered): 1 We watch the weather and your store. 2 You get an alert. 3 Swipe to claim and watch the money arrive | Each step has a small phone-screen illustration |
| 5 | What's covered | Five cards with custom glyphs: heavy rain, extreme heat, bad air, curfew, store outage, each with its plain threshold | Thresholds from PRD §9 |
| 6 | Plans | Three glass cards (₹49 / ₹89 / ₹129) with per-event amount and days a month | Same data as the app |
| 7 | Fair to honest riders | A short, plain explanation of fraud protection: the system checks where you were *before* the alert, so honest riders are paid fast and coordinated cheating is caught | Reassurance first, no jargon |
| 8 | See the app | Horizontal scroll-snap of phone screens: Home, Alert, Live tracker, Check-in | Real screenshots from the built app |
| 9 | Built with | A technical strip for reviewers: architecture summary, state machine, tech chips (React, Node.js, PostgreSQL, MongoDB, Redis, FastAPI, XGBoost), links to GitHub and the docs | Collapsible "For reviewers" panel so riders are not distracted |
| 10 | FAQ | 6 questions in an accordion | §12.5 |
| 11 | Final call to action | One sentence and **Get started** | |
| 12 | Footer | Language, privacy, terms, contact, **prototype notice** | §12.6 |

No testimonials or fabricated statistics. Social proof is added only when real.

### 12.3 Hero

**Concept:** instead of a stock illustration, the hero *is the product moment*: a phone frame in which the rain begins, the mesh turns blue, a claim dock appears, and the visitor can swipe the Kavach shield themselves. That interaction is the memorable thing about the whole brand.

```
Mobile (390 px)                          Desktop (1280 px)
┌──────────────────────────┐             ┌───────────────────────────────────────────────────────┐
│ (logo)         [Menu]    │             │ (logo)  How it works  Coverage  Plans  FAQ   [Get started]│
│                          │             │                                                       │
│ When rain stops the      │             │  When rain stops the orders,        ┌──────────┐      │
│ orders, Kavach pays you. │             │  Kavach pays you.                   │ ░ phone ░│      │
│                          │             │                                     │ rain...  │      │
│ Income cover for delivery│             │  Income cover for delivery riders.  │ [dock]   │      │
│ riders. No forms. One    │             │  No forms. One swipe.               │ (🛡>>)   │      │
│ swipe.                   │             │                                     └──────────┘      │
│ [  Get started  ]        │             │  [ Get started ]  [ See how it works ]                │
│ [ See how it works ]     │             │                                                       │
│     ┌────────────┐       │             └───────────────────────────────────────────────────────┘
│     │ ░ phone ░  │       │
│     │ (🛡>>)     │       │
│     └────────────┘       │
└──────────────────────────┘
```

**Headline:** "When rain stops the orders, Kavach pays you." Sentence case, left aligned, Display 36 / 56 px, no single-word accent.

**Demo sequence (runs once on load, replayable):**
1. Phone shows Home in "clear" state (warm beige).
2. After 1.5 s the mesh cross-fades to rain blue; a rain glyph appears; the claim dock slides in: "Rain started. Swipe to claim ₹350".
3. The thumb idle-nudges; the visitor swipes (works with mouse and touch).
4. Success: shield seals, the tracker timeline fills step by step in ~4 s, the amount counts up, a sage ring expands.
5. "Replay" ghost button.

The demo is built from the **real SwipeToConfirm and Timeline components** (shared package) running against mock data: no video, so it stays sharp, tiny, and accessible. With reduced motion or Data Saver, it shows the final "Money sent" state statically.

### 12.4 Landing Look and Layout

- Same tokens and glass system as the app, with generous space: sections 96 px apart on desktop, 64 px on mobile.
- Content width 1120 px; text columns under 60 characters.
- Section backgrounds alternate between the oat mesh and a calmer sand-tinted band; glass cards float over both.
- Headings left aligned; centre alignment only for the final call to action.
- Desktop hero uses a two-column grid (7 / 5); the phone frame is a `rounded-sheet` bezel in `walnut` at 12% opacity border, not a brand-specific device mockup.
- Motion: the hero demo only. Sections do **not** fade or slide in on scroll.

### 12.5 FAQ (Copy)

| Question | Answer |
|---|---|
| When do I get paid? | After you swipe to claim, most claims are checked in seconds and sent to your bank within minutes. |
| Do I need to fill in forms? | No. We watch conditions for you. You swipe once. |
| What is the waiting period? | New plans start covering you after 72 hours. |
| What if my claim is held? | A person reviews it within 24 hours. You can follow the status live. |
| What if the amount looks wrong? | You can raise a problem for 2 hours after money is sent. |
| Is my data safe? | Your bank and ID details are encrypted, and each platform's data stays separate. |

### 12.6 Honesty Notices

The footer and the "Built with" panel state clearly: **"Kavach is a prototype built as a student project. No real insurance is sold and no real money moves."** and **"Not affiliated with Blinkit, Zepto, or Swiggy Instamart."** Platform names appear as plain text only, never as logos.

### 12.7 SEO and Performance

- Pre-rendered HTML at build time (static generation) so crawlers and slow phones get content instantly.
- Title, meta description, Open Graph and Twitter card image (1200 × 630, rain-blue mesh with the shield), canonical URL, `lang` attribute per language.
- Targets: Lighthouse mobile **Performance ≥ 95, Accessibility 100, SEO 100**; LCP < 2.0 s on throttled 4G; initial JS < 120 KB gzipped (framer-motion is lazy-loaded only for the demo).
- The "Get started" button links to the app's `/welcome` route.

---

## 13. Admin Console (Desktop First)

For claims reviewers and tenant admins. Same palette, glass, and type as the app, but denser and keyboard-friendly. Sign-in is Google SSO limited to the tenant's allowed email domains (PRD §10.2); there is no password form.

### 13.1 Layout

Left rail (glass-2): Queue, Disputes, Live feed, Analytics, and the tenant name. Content area on `oat` with glass-1 panels. Minimum supported width 1024 px; on tablet the detail pane becomes a full-screen sheet. Table text is 15 px (minimum 14).

### 13.2 Review Queue (`/admin/queue`)

```
┌──────┬──────────────────────────────────────────────────────────────────────┐
│ rail │ Review queue   14 waiting                           [Filter ▾] [Sort ▾]│
│      │ ┌───────────────────────────────┬───────────────────────────────────┐│
│Queue │ │ Priority  Rider      Amount   │  Claim 8f21…   Held 2h 10m ago    ││
│Disp. │ │ ● 92      R. Kumar   ₹350     │  ─────────────────────────────    ││
│Live  │ │ ● 85      A. Singh   ₹500     │  Decision support                 ││
│Stats │ │ ● 71      M. Das     ₹350     │  Confidence 0.38  (below 0.40)    ││
│      │ │ ● 64      S. Iyer    ₹200     │  Signals                          ││
│      │ │                               │   Location physics   Normal       ││
│      │ │                               │   Account network    Suspicious   ││
│      │ │                               │   Claim burst        Normal       ││
│      │ │                               │   Zone claim rate    Normal       ││
│      │ │                               │   Recent deliveries  Suspicious   ││
│      │ │                               │   Before-alert check Normal       ││
│      │ │                               │  Top model factors                ││
│      │ │                               │  Timeline of this claim           ││
│      │ │                               │  Notes [__________________]       ││
│      │ │                               │  [Approve 100%] [Approve 60%] [Reject]││
│      │ └───────────────────────────────┴───────────────────────────────────┘│
└──────┴──────────────────────────────────────────────────────────────────────┘
```

- **Two panes:** a priority-ordered list (from `GET /admin/claims/queue`, PRD §8.5) and the selected claim's detail.
- Signals use plain names with a status pill (Normal in sage, Suspicious in honey); the model's top factors come from the stored SHAP explanation.
- **Keyboard:** `J` / `K` next and previous, `A` approve, `R` reject (opens a notes field that is required for rejection), `Esc` close. Shortcuts are shown in a small help panel.
- Approve and reject use a confirm dialog (desktop has no swipe), and the result updates the queue instantly via the admin SSE stream.
- A live banner appears at the top when a **fraud ring** alert arrives for a zone (PRD §7.6), linking to the affected claims.
- Hold SLA: each row shows time remaining of the 24-hour hold, turning honey under 4 hours.

### 13.3 Disputes (`/admin/disputes`)

List of open disputes with the rider's reason, the original decision, and the dispute-window times. Actions: **Uphold** (triggers an adjustment payout) or **Reject** (closes the claim), each with required notes.

### 13.4 Live Feed (`/admin/live`)

A calm, glanceable stream (SSE): new claims, state changes, held claims, ring alerts, and failed jobs, each as a one-line glass row with a timestamp. A pause button freezes scroll while reading. Counters on top: claims in progress, held, paid today.

### 13.5 Analytics (`/admin/analytics`)

Tenant-scoped (PRD §5.5). Tiles: claims today, total paid today, hold rate, average time to payout. Charts (recharts) using the palette: claims by status (stacked bars in sky, sage, honey, madder), payouts per day (walnut line), time-to-decision distribution (harbor bars). Every chart has a data-table toggle for accessibility. Date range chips: Today, 7 days, 30 days.

---

## 14. Copy, Language & Tone

### 14.1 Voice

Plain, warm, and short: the voice of a helpful person at the store counter, not a bank. Active verbs, sentence case, no jargon, no filler, no exclamation marks except in success moments. Errors never apologise and never blame: they say what happened and what to do.

| Instead of | Write |
|---|---|
| Submit | Send |
| Policy | Plan |
| Premium | Weekly price |
| Payout disbursed | Money sent |
| Claim adjudication | Under review |
| Trigger event | Heavy rain (name the event) |
| Authentication failed | That phone number or password is wrong. Try again. |
| Invalid input | Enter a 10-digit phone number. |

### 14.2 Consistent Action Names

An action keeps one name from button to toast to timeline: **Claim** (swipe label "Swipe to claim", toast "Claim sent", timeline "Claim received"); **Activate** ("Swipe to pay ₹89", toast "Plan active"); **Check in**; **Raise a problem** (never "dispute" in rider-facing text; "dispute" stays in code and admin).

### 14.3 Numbers, Dates, Money

- Money: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` giving ₹1,05,000-style grouping for large values; show paise only when non-zero.
- Dates: "17 Nov"; relative for under 48 hours ("Yesterday, 6:34 pm"); 12-hour time with lowercase am/pm.
- Always tabular numerals for amounts and countdowns.

### 14.4 Languages

| Language | Script font | Priority |
|---|---|---|
| English | Figtree | v1 |
| Hindi | Noto Sans Devanagari | v1 |
| Tamil | Noto Sans Tamil | v1 |
| Kannada, Telugu, Marathi | Noto Sans Kannada / Telugu / Devanagari | v1.1 |

- `react-i18next` with namespaces per screen; **no string concatenation**; ICU-style plurals; amounts and dates formatted separately and passed in as variables.
- Layouts tested at +40% text length and with Indic line heights.
- Language is chosen on `/welcome`, stored locally and on the profile, and switchable from Profile.
- Example drafts (to be reviewed by a native speaker before shipping):

| Key | English | Hindi | Tamil |
|---|---|---|---|
| `claim.swipe` | Swipe to claim | क्लेम के लिए स्वाइप करें | கிளைம் செய்ய ஸ்வைப் செய்யுங்கள் |
| `claim.paid` | Money sent | पैसे भेज दिए गए | பணம் அனுப்பப்பட்டது |
| `home.covered` | Cover active | कवर चालू है | காப்பீடு செயலில் உள்ளது |

### 14.5 Notification Copy (Push and In-App)

| Event | Text |
|---|---|
| Forecast | Rain expected 3–6 pm tomorrow. You're covered. |
| Alert live | Heavy rain in Koramangala. Swipe to claim ₹350. |
| Approved | Your claim is approved. Sending ₹350 now. |
| Under review | A person is checking your claim. You'll hear back within 24 hours. |
| Money sent | ₹350 sent to your bank account. |
| Plan renewing | Your plan renews tomorrow for ₹89. |

---

## 15. States: Loading, Empty, Error, Offline

Every screen defines all of these; none may show a blank page or a raw error.

| State | Pattern | Copy example |
|---|---|---|
| Loading | Skeleton that matches the final layout, shown for at least 400 ms to avoid flicker; a spinner appears only inside buttons | none |
| Slow (> 3 s) | Skeleton stays, with a quiet line under it | "Still loading. Your connection looks slow." |
| Empty | Flat SVG illustration, one sentence, one action | "No claims yet. When bad weather hits, they'll show up here." |
| Error (recoverable) | Inline glass-sand card, icon, what happened, **Try again** | "We couldn't load your plans. Check your connection and try again." |
| Error (field) | Text under the field with an icon; field border madder | "Enter a 10-digit phone number." |
| Offline | Top banner plus last known data labelled with its age; actions that need the network are disabled with a reason | "You're offline. Your cover still works. We'll update when you reconnect." |
| Session expired | Silent refresh first; if it fails, a sheet | "Please log in again to continue." |
| Permission denied (camera/location) | Sheet explaining why it is needed and how to enable it | "Allow the camera to scan the store code." |
| Maintenance / server down | Full-page glass card, no jargon, retry | "Kavach is taking a short break. Try again in a few minutes." |
| Success | Check, sage, one line, one next action | "Plan active. Cover starts Wed 18 Nov." |

---
## 16. Accessibility & Field Conditions

**Standard:** WCAG 2.1 AA as the floor, with AAA-level contrast (≥ 7 : 1) for all body text, because the app is used in sunlight.

| Area | Requirement |
|---|---|
| Contrast | Body text black on glass/oat ≥ 17 : 1; secondary text ≥ 8.3 : 1; status pills ≥ 7 : 1; non-text icons ≥ 3 : 1 (walnut 7.7 : 1, mocha 4.0 : 1 on Oat) |
| Not colour alone | Every status uses colour + icon + word; selected states add a border or check |
| Touch targets | Primary actions ≥ 56 px, all others ≥ 48 px, 8 px minimum between targets |
| Focus | Visible 2 px walnut outline with 2 px offset on every interactive element; logical tab order; focus is moved into sheets when they open and returned on close |
| Gestures | Every swipe has a non-gesture alternative: Enter/Space on the swipe track, **Use a button instead of swiping** (press-and-hold), a visible **Dispute / Dismiss** action in menus alongside swipe-left rows |
| Screen readers | Semantic HTML (`main`, `nav`, `button`, `ol` for the timeline); live claim updates announced through a polite `aria-live` region; amounts read as "350 rupees"; icons `aria-hidden` unless they carry meaning |
| Forms | Visible labels, `aria-describedby` for errors, correct `inputmode` and `autocomplete`, 16 px minimum input text (prevents iOS zoom) |
| Zoom and text size | Layouts survive 200% browser zoom and the in-app Larger text option (100 / 115 / 130%); never `user-scalable=no` |
| Motion | `prefers-reduced-motion` and Data Saver respected (§7.5) |
| Time limits | The 2-hour dispute window is shown with a visible countdown and in plain language; nothing else expires without warning |
| Language | `lang` attribute follows the chosen language; fonts and line heights tuned per script |

### 16.1 High Contrast / Sunlight Mode

One toggle (Profile > Accessibility, and a quick toggle on the top bar when the device reports very high ambient light where supported). Effects: glass becomes solid `#FBF8F2`, all borders become 2 px ink, text stays ink at 100% (secondary text also 100%), status pills gain a 2 px ink outline, the mesh becomes flat Oat.

### 16.2 Non-Goals for v1

No dark theme (the palette and sunlight use-case favour light surfaces; High Contrast covers glare). A night theme built from walnut tones can be added later.

---

## 17. Performance Budget & PWA

### 17.1 Budgets

| Metric | Worker app | Landing |
|---|---|---|
| Initial JS (gzipped) | ≤ 180 KB | ≤ 120 KB |
| Route chunk (gzipped) | ≤ 60 KB each | n/a |
| CSS (gzipped) | ≤ 30 KB | ≤ 25 KB |
| Initial fonts (woff2, subset) | ≤ 60 KB | ≤ 60 KB |
| LCP on throttled 4G, mid-range Android | ≤ 2.5 s | ≤ 2.0 s |
| Interaction latency (INP) | ≤ 200 ms | ≤ 200 ms |
| Layout shift (CLS) | ≤ 0.05 | ≤ 0.05 |
| Frame rate during swipe and sheet drags | 60 fps on a low-end test device | 60 fps |

### 17.2 Techniques

- **Route-level code splitting** (`React.lazy`); admin, charts, QR scanner, and framer-motion extras load only where used. Prefetch the claim alert and tracker routes after Home mounts.
- **Fonts:** self-hosted, subset, `font-display: swap`, preload the two critical faces; Indic scripts load only when that language is chosen.
- **Images:** SVG for illustrations and icons; AVIF/WebP with explicit width and height for screenshots; no layout shift.
- **Glass cost:** at most three blurred surfaces visible; blur on static layers only; `will-change: transform` only on the dragging thumb or sheet during a drag.
- **Lists:** virtualise beyond 50 rows; no per-row blur.
- **Data:** one SSE connection per session shared by all components through a context; stale-while-revalidate for read endpoints (e.g., plan tiers); optimistic UI for dismissals.
- **Memory-aware:** `navigator.deviceMemory <= 2` or Data Saver on enables the solid-glass, reduced-motion profile automatically.

### 17.3 Installable PWA (`vite-plugin-pwa`)

```json
{
  "name": "Kavach",
  "short_name": "Kavach",
  "description": "Income cover for delivery riders",
  "start_url": "/home",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#EFE6D8",
  "background_color": "#EFE6D8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- **App shell** is precached so the app opens offline; runtime caching: tiers and static assets cache-first, `triggers/active`, `claims`, `policies` network-first with a 3 s timeout falling back to the last response (labelled "Last updated 10 min ago"). **POST requests are never cached or replayed.**
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; use `100dvh`; honour `env(safe-area-inset-*)`; `overscroll-behavior: contain` on sheets.
- **iOS:** `apple-touch-icon`, `apple-mobile-web-app-capable`, status bar style default; vibration is unavailable on iOS, so haptic moments also have a visual cue.
- **Install prompt:** a custom glass banner after the second visit or after the first activated plan ("Add Kavach to your home screen"), dismissible, never re-shown within 14 days.
- **Notifications:** permission asked only after the first plan is activated, with a pre-explanation ("Get an alert the moment rain starts in your area"). Push delivery is mocked in this phase.
- **Updates:** a quiet glass toast "Update ready. Refresh" when a new version is available; never auto-reload mid-claim.

---

## 18. Project Structure

Plain JavaScript (JSX), npm workspaces, no Docker or CI/CD. The shared package guarantees the landing site, app, and admin use identical tokens and components.

```
frontend/
├── package.json                    ← npm workspaces: shared, landing, app
│
├── shared/                         ← @kavach/shared
│   ├── tailwind.preset.js          ← colours, radii, shadows, fonts (§3.6)
│   ├── styles/{tokens.css, glass.css, background.css}
│   ├── components/
│   │   ├── Button.jsx   GlassCard.jsx   HeroCard.jsx   StatusPill.jsx
│   │   ├── SwipeToConfirm.jsx   Timeline.jsx   CoverageRing.jsx   Skeleton.jsx
│   │   └── KavachShield.jsx        ← logo, swipe thumb, badge (SVG)
│   └── lib/{haptics.js, format.js}
│
├── landing/
│   ├── index.html
│   ├── vite.config.js              ← static pre-render at build
│   └── src/
│       ├── main.jsx
│       ├── sections/               ← Hero, Facts, HowItWorks, Coverage, Plans, Fairness, AppTour, BuiltWith, Faq, Footer
│       ├── demo/HeroDemo.jsx       ← phone frame running real shared components on mock data
│       └── content/                ← copy per language
│
└── app/
    ├── index.html
    ├── vite.config.js              ← vite-plugin-pwa configuration
    ├── public/{manifest.webmanifest, icons/}
    └── src/
        ├── main.jsx   App.jsx   routes.jsx
        ├── pages/
        │   ├── welcome/   auth/   home/   plans/   alert/   claims/
        │   ├── checkin/   notifications/   profile/
        ├── admin/                  ← lazy-loaded: queue, claim-detail, disputes, live, analytics
        ├── components/             ← TopBar, BottomNav, SideRail, Sheet, Toast, ListRow, ConditionTile, EmptyState…
        ├── hooks/                  ← useEventStream, useZoneEnv, useOnlineStatus, useA11ySettings, useClaim
        ├── lib/                    ← api.js (fetch wrapper), auth.js, i18n.js
        ├── i18n/{en,hi,ta}/*.json
        └── lab/                    ← /lab (dev only): every component in every state, for visual review
```

**Dependencies:** `react`, `react-dom`, `react-router-dom`, `tailwindcss`, `framer-motion`, `lucide-react`, `react-i18next`, `html5-qrcode`, `event-source-polyfill`, `recharts` (admin only), `vite-plugin-pwa`, `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/figtree`, Noto Sans script packages. Verify exact package names when installing.

---

## 19. Screen-to-API Map

All endpoints and stream events are defined in PRD §5. The tenant always comes from the signed-in token; the UI never sends it.

| Screen | Reads | Writes | Live stream |
|---|---|---|---|
| Sign up | none | `POST /auth/register`, OAuth `GET /auth/platform/:tenant/authorize` | none |
| Log in | none | `POST /auth/login`, `POST /auth/refresh` | none |
| Home | `GET /workers/me`, `GET /policies`, `GET /triggers/active`, `GET /claims` | none | `/stream/worker` (trigger alerts, claim updates) |
| Plans | `GET /policies/tiers` | none | none |
| Activate | `GET /policies/tiers` | `POST /policies` | none |
| Alert | `GET /triggers/:id`, `GET /policies/:id/coverage` | `POST /claims` (with `Idempotency-Key`) | `/stream/worker` |
| Claim tracker | `GET /claims/:id`, `GET /claims/:id/status` (on reconnect) | none | `/stream/claims/:id` |
| Claims list | `GET /claims` | none | `/stream/worker` |
| Raise a problem | `GET /claims/:id` | `POST /claims/:id/dispute` | none |
| Check-in | none | `POST /workers/me/checkin/qr`, `POST /workers/me/gps` | none |
| Notifications | `GET /workers/me/notifications` | none | `/stream/worker` |
| Profile / bank | `GET /workers/me` | `PUT /workers/me`, `POST /workers/me/bank-verify` | none |
| Admin queue | `GET /admin/claims/queue`, `GET /claims/:id` (admin view) | `POST /admin/claims/:id/review` | `/stream/admin` |
| Admin disputes | disputes list | `POST /admin/disputes/:id/resolve` | `/stream/admin` |
| Admin analytics | `GET /admin/analytics/tenant` | none | none |
| Admin demo control (dev) | none | `POST /admin/triggers/simulate` | none |

Error codes surfaced with custom messages: `PLATFORM_NOT_LINKED`, `POLICY_ALREADY_ACTIVE`, `WAITING_PERIOD_ACTIVE`, `NO_ACTIVE_TRIGGER`, `NO_ACTIVE_POLICY`, `COVERAGE_CEILING_REACHED`, `DISPUTE_WINDOW_CLOSED`, `TOO_MANY_STREAMS`, `TOKEN_EXPIRED`.

---

## 20. Quality Bar, QA Checklist & Build Order

### 20.1 What "Feels Like a Shipped App" Means Here

1. **Consistency:** no hard-coded colours, radii, or shadows outside the tokens; only the three glass levels and five radii exist.
2. **Responsiveness to touch:** feedback within 100 ms of any press; swipes follow the finger exactly; springs and haptics on release.
3. **Liveness:** claim and alert updates appear without a refresh; connection state is always visible.
4. **Completeness:** every screen has loading, empty, error, offline, and success states with real copy.
5. **Polish in the small things:** tabular numerals, count-up amounts, skeletons shaped like the content, safe-area padding, no layout shift, correct keyboards for each field.
6. **Honest and calm:** no fake statistics, no fraud language to riders, no alarming red unless something truly failed.

### 20.2 QA Checklist

**Visual**
- [ ] Palette, type scale, radii, shadows come only from tokens
- [ ] Contrast audit passes (body text ≥ 7 : 1 everywhere, including High Contrast mode)
- [ ] Glass legible over every mesh state (clear, rain, heat, air, offline)
- [ ] No more than three blurred surfaces on any screen
- [ ] Fallback verified with `backdrop-filter` disabled, Data Saver on, and reduced transparency on

**Interaction**
- [ ] SwipeToConfirm: threshold, spring-back, velocity commit, error recovery, idempotent re-swipe, keyboard, press-and-hold alternative
- [ ] Bottom sheets: drag, snap, scrim dismiss, focus management
- [ ] Pull to refresh, swipe rows, carousels work with one hand on a 6.7-inch phone
- [ ] Live claim timeline advances without refresh and recovers after a dropped connection
- [ ] Haptics fire on pick-up, success, error, and respect the setting

**Responsive and devices** (test at 360 × 640, 390 × 844, 412 × 915, 768 × 1024, 1024 × 768, 1440 × 900)
- [ ] Mobile bottom bar, tablet two-pane, desktop three-zone layouts all correct
- [ ] Chrome and Samsung Internet on Android, Safari on iOS, Chrome/Edge/Firefox on desktop
- [ ] Installs as a PWA; opens offline with the cached shell; safe areas correct on notched devices

**Content and language**
- [ ] Every string comes from i18n; no concatenated sentences
- [ ] Hindi and Tamil reviewed by native speakers; layouts hold at +40% length
- [ ] All error, empty, and offline copy matches §15

**Performance and accessibility**
- [ ] Lighthouse mobile: app Performance ≥ 90, Accessibility ≥ 95; landing Performance ≥ 95, Accessibility 100
- [ ] Bundle budgets in §17.1 met; 60 fps swipe on a low-end device
- [ ] axe-core: zero critical or serious issues; TalkBack walkthrough of sign-up, claim, and tracker
- [ ] 200% zoom and Larger text 130% usable

**Demo readiness**
- [ ] Admin "simulate trigger" produces a live rain alert on a phone within seconds
- [ ] Full demo path recorded: landing, sign-up, activate plan, alert, swipe to claim, live tracker, money sent, admin queue

### 20.3 Build Order

| Phase | Deliverable | Why this order |
|---|---|---|
| 1 | Tokens, glass, background mesh, shared Button, GlassCard, **SwipeToConfirm**, Shield SVG, `/lab` page | The design system and the signature interaction are the foundation; everything else reuses them |
| 2 | App shell (TopBar, BottomNav), Welcome, Sign up, Log in, **Home**, Plans, Activate | The first complete rider journey |
| 3 | **Alert, claim swipe, live Claim tracker** (SSE) | The core value of the product; build and polish early |
| 4 | Check-in, Claims list, Raise a problem, Notifications, Profile and Accessibility | Completes the app |
| 5 | **Landing site** with the live hero demo | Reuses the real components; the showcase |
| 6 | Admin console (queue, detail, disputes, live, analytics) | Desktop surface, shares everything |
| 7 | i18n (Hindi, Tamil), PWA, performance and accessibility audit, device testing | Final polish and proof |

**If time is short, protect this slice:** Home, Alert plus swipe claim, live Claim tracker, and the Landing hero demo. They carry the whole story.

### 20.4 Open Items

- Logo and shield artwork (SVG), custom weather glyphs, empty-state illustrations
- Real app screenshots for the landing "See the app" section (capture after Phase 4)
- Native-speaker review of Hindi and Tamil strings
- Final decision on the product's public name for the landing page (Kavach, InsureGig, or both)

---

*Kavach Frontend Design Specification v1.0 — mobile first, built for riders*
