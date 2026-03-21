# Design System Strategy: The Financial Architect

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

In a world of cluttered, anxiety-inducing financial apps, we lean into high-end editorial layouts that treat wealth management with the reverence of a premium lifestyle magazine. We break the "standard template" look by rejecting rigid, boxy grids in favor of **Intentional Asymmetry**. 

By utilizing oversized typography scales and overlapping elements, we create a sense of bespoke craftsmanship. The layout isn't just a container for data; it is an environment where breathing room (whitespace) is as important as the numbers themselves. We prioritize a "layered depth" model over flat planes, making the interface feel like a series of physical, high-quality materials stacked with precision.

---

## 2. Colors & Surface Architecture
Our palette centers on deep indigos (`#0b1326`) and vibrant violets, providing a sophisticated backdrop for high-contrast financial data.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or grouping. Boundaries must be defined solely through background color shifts. Use `surface-container-low` for secondary sections sitting on a `surface` background. 

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of frosted glass.
- **Base Layer:** `surface` (#0b1326)
- **Secondary Tier:** `surface-container-low` (#131b2e)
- **Interactive Tier:** `surface-container` (#171f33)
- **Elevated/Floating Tier:** `surface-container-highest` (#2d3449)

### The "Glass & Gradient" Rule
To move beyond a "generic" feel, use **Glassmorphism** for floating headers or navigation bars. Apply a `backdrop-blur` of 20px-40px to `surface-variant` at 60% opacity. 
*   **Signature Textures:** For main CTAs and Hero Graphs, use a subtle linear gradient transitioning from `primary` (#bac3ff) to `primary-container` (#3f51b5) at a 135-degree angle. This adds "soul" and dimension that flat fills lack.

---

## 3. Typography: The Editorial Voice
We use a dual-typeface system to balance authority with utility. 

*   **Display & Headlines (Manrope):** Chosen for its geometric precision and modern "tech-premium" feel. Use `display-lg` (3.5rem) for account balances to make wealth feel substantial.
*   **Body & Labels (Inter):** Chosen for maximum legibility at small sizes. 
*   **Hierarchy Tip:** Always pair a `headline-lg` with a `body-md` in `on-surface-variant` to create a clear "Title-to-Detail" relationship. Use `label-sm` in all-caps with 0.05em letter spacing for category headers to evoke a boutique editorial aesthetic.

---

## 4. Elevation & Depth
We convey hierarchy through **Tonal Layering** rather than structural lines.

*   **The Layering Principle:** Depth is achieved by "stacking." Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft, natural lift without the "heaviness" of a dark shadow.
*   **Ambient Shadows:** For floating elements (like Modals), use a shadow with a blur of `40px` and an opacity of `8%`. The shadow color must be a tinted version of `on-surface` (#dae2fd) rather than pure black, mimicking natural ambient light.
*   **The "Ghost Border" Fallback:** If a boundary is strictly required for accessibility, use the `outline-variant` token at **15% opacity**. 100% opaque borders are strictly forbidden.
*   **Glassmorphism Integration:** Use `surface-tint` (#bac3ff) at 5% opacity on elevated cards to simulate light hitting the edge of a glass pane.

---

## 5. Components

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary-container`), `xl` (1.5rem) roundedness. No border.
*   **Secondary:** `surface-container-high` fill with `primary` text.
*   **Tertiary:** Ghost style; `on-surface` text with no background. Use `2.5` (0.85rem) horizontal spacing.

### Cards & Lists
*   **Forbid Dividers:** Do not use lines to separate transactions. Use `spacing-4` (1.4rem) of vertical white space or alternate background tones between `surface-container-low` and `surface-container-lowest`.
*   **Corner Radius:** All cards must use `xl` (1.5rem) or `lg` (1rem) roundedness to maintain the "Soft Professional" aesthetic.

### Data Visualization
*   **Income/Expenses:** Use `tertiary` (#4edea3) for income and `error` (#ffb4ab) for expenses. 
*   **Graph Styling:** Line charts should use a `primary` stroke (2px) with a soft gradient area fill underneath (10% opacity) to provide volume without clutter.

### Input Fields
*   **States:** Default state uses `surface-container-highest`. Focus state uses a `ghost border` of `primary` at 40% opacity and a subtle `surface-tint` inner glow.

---

## 6. Do’s and Don’ts

### Do
*   **DO** use `spacing-16` (5.5rem) or `20` (7rem) for section margins to create an "expensive" feel.
*   **DO** overlap elements (e.g., a card partially overlapping a gradient header) to break the grid.
*   **DO** use `manrope` for all numerical data to ensure a high-end, tabular look.

### Don't
*   **DON'T** use 1px dividers or solid borders. Ever.
*   **DON'T** use pure black (#000000) for shadows; it kills the "Deep Indigo" atmosphere.
*   **DON'T** crowd the screen. If a view feels "full," move content to a horizontal scroll `surface-container`.
*   **DON'T** use standard 4px or 8px corners. Stick to the `lg` (16px) minimum for the "Soft Minimalism" feel.

---

## 7. Spacing & Rhythm
Rhythm is controlled via the **Atomic Spacing Scale**. 
*   **Content Padding:** Always use `spacing-6` (2rem) for internal card padding.
*   **Section Gaps:** Use `spacing-10` (3.5rem) to separate major functional blocks (e.g., Balance vs. Transaction List).
*   **Micro-spacing:** Use `spacing-1.5` (0.5rem) to group labels with their corresponding data points.