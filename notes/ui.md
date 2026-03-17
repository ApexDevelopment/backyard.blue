# UI & Design

## Color Schemes

Backyard supports multiple color schemes, each with light and dark variants. Schemes are defined as CSS custom property blocks in `src/app.css` using `[data-theme='<scheme>-<mode>']` selectors.

The active scheme is stored in a `backyard_theme` cookie as a compound string (e.g. `chocoberry-light`) so the server can inject the correct `data-theme` during SSR, preventing a flash of wrong theme. The `theme` store in `src/lib/stores/theme.ts` exposes derived stores `themeMode` (`'light' | 'dark'`) and `themeScheme` (the scheme name) for components that need to branch on mode or scheme.

### Adding a new scheme

1. Add the scheme name to the `ColorScheme` union type in `src/lib/types.ts`.
2. Add an entry to the `COLOR_SCHEMES` array in `src/lib/stores/theme.ts` (provides the display label and description for the settings UI).
3. Add `[data-theme='<name>-light']` and `[data-theme='<name>-dark']` blocks in `src/app.css`. Every token listed in the Chocoberry block must be defined — there are no fallback values.

### Design Tokens (structural, scheme-independent)

Set on `:root` in `src/app.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm/md/lg/full` | `8px` / `12px` / `16px` / `9999px` | Border radii |
| `--max-width` | `640px` | Content column |
| `--header-height` | `60px` | Top nav bar |
| `--font-sans` | Inter, system fallbacks | Body text |
| `--font-mono` | JetBrains Mono, Fira Code | Code text |

## Heading Scale

All headings are styled via Svelte scoped `<style>` blocks rather than global rules. To keep sizing and weight consistent across pages, every heading must conform to one of the tiers below.

| Tier | Element | `font-size` | `font-weight` | `color` | When to use |
|------|---------|-------------|---------------|---------|-------------|
| **Page title** | `h1` | `1.25rem` | 700 | `var(--text-primary)` | Standard in-app page headings (feed, activity, settings, search, tags, following, etc.) |
| **Hero title** | `h1` | `1.375rem` | 700 | `var(--text-primary)` | Centered landing pages (login, onboarding, create profile) |
| **Section heading** | `h2` | `1rem` | 600 | `var(--text-primary)` | Named sections within a page (comments, search result groups) |
| **Section label** | `h2` | `0.8125rem` | 600 | `var(--text-tertiary)` | Small category labels in sidebars/settings. `letter-spacing: 0.02em`. |
| **Card title** | `h3` | `0.9375rem` | 600 | *(inherited)* | Titles inside cards (onboarding choices, etc.) |
| **Modal title** | `h2` | `1.0625rem` | 700 | *(inherited)* | Dialog/modal headers (composer) |

**Rules:**
- Every heading must explicitly set `color` unless it naturally inherits the correct value from a parent (e.g. inside a card that already sets `--text-primary`).
- Spacing between a heading and its subsequent content should be handled by the parent container's `gap`, not by `margin-bottom` on the heading, when the parent is a flex/grid container.
- No `text-transform`. All text in Backyard is lowercase by convention.

## Theme Toggle

The toggle uses Lucide `Moon`/`Sun` icons and flips light ↔ dark within the current color scheme.

## Icons

All icons use the `lucide-svelte` library. Components used:

| Icon | Component | Usage |
|------|-----------|-------|
| `House` | SideNav | Home link |
| `Plus` | Header | Compose button |
| `Search` | Header | Search link |
| `LogOut` | Header | Logout button |
| `Moon` / `Sun` | ThemeToggle | Theme switcher |
| `Bell` | SideNav | Notifications/activity link |
| `User` | SideNav | Profile link |
| `Settings` | SideNav | Settings link |
| `Menu` | Header | Mobile menu toggle |
| `MessageCircle` | PostCard | Comment count |
| `Repeat2` | PostCard | Reblog count/button |
| `Heart` | PostCard | Like count/button |
| `ChevronDown` | PostCard | Context menu toggle |
| `Ellipsis` | PostCard, ProfileCard | More actions menu |
| `ChevronLeft` / `ArrowLeft` | Various pages | Back navigation |
| `X` | Various | Close/dismiss actions |
| `Trash2` | PostCard, ViolationModal | Delete actions |
| `Pencil` | PostCard | Edit actions |
| `ShieldAlert` | PostCard | Admin: flag post for deletion |
| `ShieldX` | PostCard, ProfileCard | Admin: ban user |
| `Ban` | Various | Block user |
| `Bold` / `Italic` / `Underline` / `Strikethrough` | RichTextEditor | Text formatting toolbar |
| `ImagePlus` | RichTextEditor | Insert image |
| `Link` | RichTextEditor | Insert link |
| `Type` | RichTextEditor | Text block |
| `Camera` | ProfileEditor | Avatar/banner upload |
| `Hash` | TagInput | Tag indicator |
| `UserPlus` | ProfileCard | Follow button |
| `RefreshCw` | PullToRefresh | Refresh indicator |
| `Save` | ProfileEditor, Settings | Save action |

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
| `NewsPanel.svelte` | Right-column news panel showing `site.standard.document` entries. Hidden below 1100px. |
| `PostCard.svelte` | Displays a post or reblog with actions (like, comment, reblog). Supports admin moderation actions. |
| `PostComposer.svelte` | Modal for creating new posts with block-based content (text, images, embeds) |
| `ProfileCard.svelte` | Profile banner, avatar, stats, follow/block buttons. Admin ban action. |
| `ProfileEditor.svelte` | Profile editing form (display name, bio, avatar, banner, colors) |
| `ThemeToggle.svelte` | Light/dark theme switcher |
| `RichTextEditor.svelte` | Rich text input with formatting toolbar (bold, italic, links, mentions) |
| `RichTextRenderer.svelte` | Renders rich text with facets (mentions, links, tags) as interactive elements |
| `ContextMenu.svelte` | Reusable dropdown context menu with icon support |
| `EmbedCard.svelte` | OpenGraph/Twitter Card link preview card |
| `TagInput.svelte` | Tag entry component with add/remove support |
| `PullToRefresh.svelte` | Mobile pull-to-refresh gesture handler |
| `ViolationModal.svelte` | Full-screen blocking modal for pending post deletion violations |
| `BackyardLogo.svelte` | SVG logo component |

## Three-Column Layout

The root layout (`+layout.svelte`) uses a three-column flex layout:

| Column | Component | Width | Behavior |
|--------|-----------|-------|----------|
| Left | `SideNav` | 200px | Sticky, collapses to icon-only at ≤960px, hidden at ≤640px |
| Center | Page content | max 640px (`--max-width`) | Always visible, fills available space |
| Right | `NewsPanel` | 280px | Sticky, hidden at ≤1100px |

The outer `.layout` wrapper has `max-width: 1160px` and is centered with `margin: 0 auto`.
