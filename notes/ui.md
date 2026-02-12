# UI & Design

## Color Scheme

Backyard uses a warm, muted palette — cream/white backgrounds with maroon accents. Both light and dark themes are defined via CSS custom properties in `src/app.css`.

### Light Theme

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#faf8f5` | Page background (warm white) |
| `--bg-secondary` | `#f3efe9` | Secondary surfaces |
| `--bg-card` | `#ffffff` | Card backgrounds |
| `--text-primary` | `#2c2420` | Main body text (warm dark brown) |
| `--text-secondary` | `#5c524a` | Secondary/muted text |
| `--text-link` | `#7c3040` | Links |
| `--accent` | `#8b3a4a` | Primary accent (maroon) |
| `--accent-light` | `#f2dce0` | Accent background tint |
| `--danger` | `#c44040` | Destructive actions, active likes |

### Dark Theme

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#1c1917` | Page background (warm charcoal) |
| `--bg-card` | `#262220` | Card backgrounds (warm dark brown) |
| `--text-primary` | `#e0d9d4` | Main body text |
| `--accent` | `#c26070` | Primary accent (rosy) |
| `--accent-hover` | `#d9899a` | Accent hover state |

### Design Tokens

- Border radii: `8px` / `12px` / `16px` / `9999px` (pill)
- Max content width: `640px`
- Header height: `60px`
- Font stack: Inter, system fonts fallback
- Monospace: JetBrains Mono, Fira Code

## Theme Toggle

The theme preference is stored in a `backyard_theme` cookie (not localStorage) so the server can inject the correct `data-theme` attribute during SSR, preventing a flash of wrong theme.

The toggle uses Lucide `Moon`/`Sun` icons.

## Icons

All icons use the `lucide-svelte` library. Components used:

| Icon | Component | Usage |
|------|-----------|-------|
| `House` | Header | Home link |
| `Plus` | Header | Compose button |
| `Search` | Header | Search link |
| `LogOut` | Header | Logout button |
| `Moon` / `Sun` | ThemeToggle | Theme switcher |
| `MessageCircle` | PostCard | Comment count |
| `Repeat2` | PostCard | Reblog count/button |
| `Heart` | PostCard | Like count/button |
| `ChevronLeft` | Various pages | Back navigation |
| `X` / `XCircle` | Various | Close/dismiss actions |

## Post Composer

The post composer is a **modal overlay** (not an inline text box). It is triggered by the "Post" button in the header:

- The `Header` component accepts an `onCompose` callback prop
- The modal renders as a fixed overlay with a semi-transparent backdrop
- Closes on Escape key, backdrop click, or the X button
- Slide-in animation from the top
- Available from any page (lives in the root layout)

## Components

| Component | Description |
|-----------|-------------|
| `Header.svelte` | Top navigation bar with home, compose, search, logout |
| `SideNav.svelte` | Left-column navigation: home, notifications, profile, settings. Sticky, collapses to icons on medium screens, hidden on mobile. |
| `NewsPanel.svelte` | Right-column placeholder for news/announcements. Hidden below 1100px. |
| `PostCard.svelte` | Displays a post or reblog with actions (like, comment, reblog) |
| `PostComposer.svelte` | Modal for creating new posts |
| `ProfileCard.svelte` | Profile banner, avatar, stats, follow button |
| `ThemeToggle.svelte` | Light/dark theme switcher |

## Three-Column Layout

The root layout (`+layout.svelte`) uses a three-column flex layout:

| Column | Component | Width | Behavior |
|--------|-----------|-------|----------|
| Left | `SideNav` | 200px | Sticky, collapses to icon-only at ≤960px, hidden at ≤640px |
| Center | Page content | max 640px (`--max-width`) | Always visible, fills available space |
| Right | `NewsPanel` | 280px | Sticky, hidden at ≤1100px |

The outer `.layout` wrapper has `max-width: 1160px` and is centered with `margin: 0 auto`.
