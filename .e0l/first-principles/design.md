<!-- @format -->

# Design

What "tasteful, minimal, highly functional" means concretely enough to build against and check.

> Sources: `doctrine.md` §design (retired); Brand Directive design principles (retired, see [`docs/archive/`](../archive/2026-07-brand-directive.md)). External references are cited inline and listed under [Sources](#sources).

## Function decides form

The first question is never how it looks. It is whether a person can use it — accessibility, then usability, then intuitiveness. Functionality drives design; design does not drive functionality.

Three principles carry forward, and each has a testable consequence:

- **Less is more.** Essential elements only. Clutter is a decision to make the user work harder. *Test: remove an element. If nothing is lost, it was decoration.*
- **Clarity and readability.** Legible, unambiguous, comprehensible without a legend. *Test: can a stranger name what this screen is for in five seconds?*
- **User-centric.** Every decision resolves toward what the user needs to do next. *Test: what is the one thing this screen wants you to do, and is it the most prominent thing on it?*

**The generic test applies to design exactly as it applies to prose:** could this exact layout, lockup, or palette move unchanged to a different product? If yes, it is slop, however polished. See [anti-slop/copy.md](anti-slop/copy.md).

## Accessibility is the floor, not a feature

**WCAG 2.2 Level AA is the minimum for every surface.** Not a launch checklist item — a build constraint, because retrofitting it is an order of magnitude more expensive than not breaking it.

**Contrast, non-negotiable:**

| Element | Minimum ratio |
| --- | --- |
| Normal text | **4.5:1** |
| Large text (≥24px, or ≥19px bold) | **3:1** |
| UI components and meaningful graphics | **3:1** against adjacent colour |

WCAG 2.2 adds nine criteria over 2.1. The five that most often catch us:

- **2.4.11 Focus Not Obscured (AA)** — a focused element must not be entirely hidden by author content. Sticky headers and cookie bars are the usual culprits.
- **2.5.7 Dragging Movements (AA)** — anything draggable needs a single-pointer alternative. A drag-to-reorder list needs buttons too.
- **2.5.8 Target Size (AA)** — interactive targets meet a minimum size. Our floor is **44×44** device-independent pixels everywhere, which also satisfies Apple's requirement.
- **3.3.7 Redundant Entry (A)** — never ask for information the user already gave you in the same process.
- **3.3.8 Accessible Authentication (AA)** — no cognitive-function test to log in. No "retype this from your email" puzzles; allow paste.

**Always:** visible focus indicators, semantic HTML before ARIA, keyboard reachability for everything clickable, `prefers-reduced-motion` honoured, and text that survives 200% zoom.

**A known limitation, stated because it changes decisions.** WCAG 2.x contrast is a luminance ratio and ignores font weight, size, and polarity. It passes combinations that read badly — saturated orange or green on white — and rejects some that read well. Where a pair passes 2.x but looks thin or vibrating, **trust the eye and fix it**; where the eye is unsure, the ratio is the tiebreak. APCA is the perceptual successor headed for WCAG 3; treat it as a diagnostic today, not as the compliance bar.

## Colour

**Author colour in OKLCH.** Its lightness axis is perceptually uniform, so equal `L` values look equally bright across hues — a blue and a yellow at the same `L` genuinely match, which is not true in HSL. That is what makes a generated scale usable without a per-hue correction table, and it is why programmatic palettes stop needing hand-tuning.

Rules:

- **A neutral spine plus one accent.** Products earn their colour by restraint. A second accent needs a reason that is not "it looked plain."
- **Colour never carries information alone.** Pair it with text, icon, or position — colour-blind users and greyscale printing both.
- **Generate ramps by stepping `L` at fixed intervals**, holding hue, adjusting chroma near the extremes where the gamut narrows.
- **Semantic naming, not literal.** `surface`, `ink`, `accent`, `danger` — never `blue-500`. A literal name makes a theme change a rename.
- **Dark mode is a designed variant, not an inversion.** Pure black backgrounds and pure white text produce halation; use a near-black surface and a slightly-off-white ink.

## Typography

**A modular scale, not arbitrary sizes.** Pick one ratio and derive every step from a 16px base: 1.2 (minor third) for dense interfaces, 1.25 (major third) as the default, 1.333 (perfect fourth) for editorial. Every size in the product comes from the scale.

- **Measure: 60–75 characters** for body text. Set it in `ch`. Wider and the eye loses the next line; narrower and it returns too often.
- **Leading scales inversely with size.** Roughly 1.5–1.65 for body, tightening toward 1.1–1.2 for display, because large letterforms gain visual mass and need less air.
- **Relative units only.** `rem` for global sizing, `em` for component-local. Pixel font sizes ignore the user's browser setting, which is an accessibility failure, not a style choice.
- **Fluid sizing with `clamp()`**, but always with a floor and ceiling: `clamp(1rem, 2.5vw, 1.25rem)`. Unbounded viewport units break at both extremes.
- **Every font stack degrades to something readable.** A fallback chain that ends in `monospace` for a serif display face is a bug.

## Motion

Motion clarifies causation — what came from where, what is loading, what changed. Motion that decorates is noise.

- **Fast and few.** 120–200ms for most transitions; anything over 300ms feels broken on repeat.
- **One easing family** across the product. Ease-out for entrances, ease-in for exits.
- **`prefers-reduced-motion` is honoured, not approximated.** Reduce to a cross-fade or nothing — never just make it faster.
- **Never animate an element the user is reading.**

## Design tokens

Design decisions live as tokens; surfaces consume tokens and never literals.

Follow the [Design Tokens Community Group format](https://www.designtokens.org/TR/drafts/format/): each token carries `$value`, a `$type`, and a `$description`. The spec's types are `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, plus composites like `typography`. Groups may set a `$type` their children inherit, and aliases use `{group.token}` so one change propagates.

Tokens are the interoperability layer across the four surfaces: one source generates CSS custom properties for web, a Swift constants file, a Compose theme, and inlined values for email. Hand-maintaining four palettes guarantees four palettes.

**A design system that exists but is not adopted is worse than none**, because it implies a consistency that is not there. Prove adoption with a check that fails when a surface bypasses the tokens — grep the built output for literal hex values and pixel sizes in styled properties. That check is the difference between having a design system and claiming one.

## Per-surface directives

### Web — Astro, React islands, Tailwind

Tailwind's theme **is** the token layer: map tokens into `theme.extend` and use scale utilities, never arbitrary values. `p-[13px]` in a diff is a token that should exist.

Static-first ([coding.md](coding.md#3-static-by-default-interactivity-is-opt-in-and-small)) is a design constraint as much as an engineering one — it forces the question of whether an interaction is needed at all. Server-render content; hydrate only genuine interaction.

Layout is composed for the content, not poured into a template. **Centered-everything, evenly-spaced card grids, and a stock hero above three feature boxes are the default-template smell** — the single most recognisable signature of generated design.

Design the states nobody remembers: empty, loading, error, and too-much-content. A screen shown only with ideal data is a screen designed for a demo.

### Email and rendered artifacts

A genuinely different craft, constrained by clients that have not moved in a decade.

- **Tables for layout.** Outlook 2016–2021 renders through Word's engine: no flexbox, no grid, no modern layout. This is not conservatism, it is the target.
- **Inline the critical CSS.** Treat `<style>` blocks as progressive enhancement.
- **Design for dark mode explicitly.** Apple Mail honours `prefers-color-scheme` fully; Gmail on Android partially inverts, leaving images untouched; Outlook applies its own transform. Avoid pure `#000` and `#FFF`, which invert unpredictably — a near-black on off-white survives better.
- **Transparent-background PNG logos**, so one asset works on either polarity.
- **Every image needs alt text and a design that survives images being blocked.**
- **Test in Apple Mail, Gmail, and Outlook before sending.** Not one of them; all three.
- Where a layer can be composited deterministically — typography over a generated background — **do that rather than asking a model to render text.** Generated lettering is a reject, not a defect to be fixed.

### Native mobile — SwiftUI and Jetpack Compose

Native means native. The point of the mandate is platform conformance, so a design that fights the platform has spent the cost and abandoned the benefit.

**iOS:** system components before custom ones — they get accessibility, Dynamic Type, and appearance adaptation for free, and they inherit future OS changes. Support **Dynamic Type** and test at both extremes, `xSmall` and the accessibility sizes; hardcoded font sizes break there. **44×44pt minimum targets.** Honour Dark Mode, Reduce Motion, and Increase Contrast as first-class requirements. iOS layout is comfortable, not dense — a web instinct for packed dashboards reads as wrong.

**Android:** Material 3 through `MaterialTheme` tokens — `MaterialTheme.colorScheme.primary`, never a hardcoded colour. M3's type scale is Display/Headline/Title/Body/Label, each in small/medium/large. M3 Expressive's motion is **spring-based** (stiffness and damping) rather than duration-and-easing, applied through motion themes rather than per-animation tuning. Support dynamic colour where it does not fight the brand.

Do not port one platform's navigation to the other. A bottom tab bar and a navigation drawer are not interchangeable.

### Desktop — Tauri

Desktop is denser than mobile and keyboard-first.

- **Keyboard parity for every action.** If it can only be clicked, it is unfinished.
- **Respect OS conventions**: native menus, standard shortcuts, window state remembered across launches.
- **Design for the resize range you actually support**, and state the minimum window size.
- Follow the system light/dark preference by default.

## Applying this to generated design

Imagery and layout produced by generative tools are held to the same bar, and fail in recognisable ways: generic stock look, mismatched subject, generator artifacts in hands and text, over-symmetry, uncanny typography, interchangeable lockups, and colour noise. The catalogue is in [anti-slop/copy.md](anti-slop/copy.md#imagery).

The strongest defence is composition: keep type, rules, and marks **deterministic**, and let generation own only what it is good at — texture, background, atmosphere. A generated layer that starts drawing its own text or frames has crossed the line and is rejected rather than corrected.

## Open

Two gaps, named rather than filled with invented specifics:

- **The Exit Zero Labs visual identity does not exist.** The Brand Directive claimed to define it and specified no palette, typography, or logo usage. Until it is designed, products inherit the principles here and invent their own language on top.
- **No token pipeline is built.** The DTCG format is the stated target; nothing currently generates the four per-surface outputs from one source.

Both are tracked work. Until they land, this document describes how to decide — not a system you can import.

## Sources

- [W3C — Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [Design Tokens Community Group — Format specification](https://www.designtokens.org/TR/drafts/format/)
- [Apple — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)
- [Evil Martians — OKLCH in CSS: why we moved from RGB and HSL](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)
- [Myndex — APCA (Accessible Perceptual Contrast Algorithm)](https://git.apcacontrast.com/documentation/WhyAPCA.html)
- [Litmus — The ultimate guide to dark mode for email](https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers)
