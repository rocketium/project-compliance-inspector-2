# Design System: Rocketium Review

## 1. Visual Theme & Atmosphere
Rocketium Review should feel like a restrained creative QA cockpit: dense enough for repeated work, but calm enough for reviewing visual decisions. Use zinc neutrals, crisp white surfaces, exact spacing, and one muted gold accent borrowed from the logo. Density is 6, variance is 5, motion is 4.

## 2. Color Palette & Roles
- **Canvas White** (#F8F8F6) - Primary light background.
- **Panel White** (#FFFFFF) - Login panels, cards, menus, and elevated controls.
- **Ink Zinc** (#18181B) - Primary text and high-contrast buttons.
- **Muted Zinc** (#71717A) - Secondary copy, metadata, placeholders.
- **Night Zinc** (#111113) - Extension and dark-mode canvas.
- **Rail Border** (#E4E4E7) - Structural lines and input borders.
- **Rocket Gold** (#B98219) - Single brand accent for primary actions, focus states, active markers, and logo-adjacent details.

## 3. Typography Rules
- **Display:** Geist, Satoshi, ui-sans-serif - Tight, quiet, weight-led hierarchy.
- **Body:** Geist, Satoshi, ui-sans-serif - 1rem minimum, relaxed line-height, max 65ch for prose.
- **Mono:** Geist Mono, JetBrains Mono, ui-monospace - Timers, dimensions, IDs, and dense numbers.
- **Banned:** Inter, generic serif fonts, neon gradient headers, and oversized dashboard headings.

## 4. Component Stylings
- **Buttons:** Minimum 44px height, 12px radius, transform-only tactile active state, visible focus ring in Rocket Gold. Primary CTAs use Ink Zinc with white text in light mode and Rocket Gold with Ink Zinc text in dark mode; icons and nested text must inherit `currentColor`. Disabled CTAs must be readable in light and dark mode: muted zinc fill, muted zinc text, no white-on-white or near-white-on-white states. Never add local `text-*`, `bg-*`, or dark-mode color utilities to shared primary CTA classes.
- **Cards/Panels:** Use 16px radius in the main app and 18px in extension chrome; elevation stays subtle and never glows. Repeated cards need visible separation: at least 8px between compact creative cards and 10-12px between rule/result cards.
- **Inputs:** Label above, helper/error text below, 12px radius, consistent 12px internal padding, Rocket Gold focus ring.
- **Loading:** Prefer skeletons or contained spinners that preserve layout dimensions.
- **Errors:** Inline, rose-tinted, icon-supported, and adjacent to the failed action.

## 5. Layout Principles
Use a 4px spacing rhythm with common steps of 8, 12, 16, and 24px. Login is asymmetric on desktop and single column below 768px. Toolbars use fixed-size icon buttons. Repeated bordered cards must never touch or read as a continuous column. No horizontal mobile overflow, no nested cards, and no overlapping elements.

## 6. Motion & Interaction
Use 140-200ms transitions, `transform` and `opacity` only. Hover states should clarify clickability; active states press down by 1px. Avoid decorative animation unless it communicates current work.

## 7. Anti-Patterns
No emojis, no Inter, no pure black, no neon outer glows, no purple/blue gradient hero treatment, no custom cursors, no generic filler copy, no 3-column marketing card rows, and no centered oversized hero for the login screen. Login copy must not mention implementation/vendor details such as auth providers, storage, or internal stack names, and must not frame the screen as a protected workspace.
