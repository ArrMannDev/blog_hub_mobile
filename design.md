# BlogHub Mobile — Design Guidelines

Status: Visual specification for review. No UI implementation is part of this document.
Updated: 2026-10-30
Product scope: See spec.md.
Visual authority: The two-screen ReadWave reference attached by the user: codex-clipboard-418da5e4-fcd7-42f5-bd23-1b1e908d5c0d.png.

## 1. Direction

A quiet editorial reading app: warm paper, dark ink, expressive serif headlines, compact article rows, and pale butter-colored navigation.

The reference is the visual direction for BlogHub. Keep the reading-first character when extending it to search, writing, authentication, and account settings.

- Let typography and article artwork create the visual interest.
- Separate feed items with fine rules and space, rather than raised cards.
- Keep navigation simple and visually light.
- Use serif typography for content and a restrained sans-serif for controls.
- Use generous, readable article text even though the reference screenshot is small.
- Concentrate strong colors in actual article imagery.
- Reading surfaces prioritize comprehension; editor/account surfaces prioritize clear actions.

The gray presentation canvas, phone frames, fake status bars, and device shadows belong to the reference presentation. They are not app UI.

## 2. Reference interpretation and product adaptations

| Reference element | BlogHub decision |
| --- | --- |
| ReadWave wordmark | Use BlogHub; retain the small bold italic serif treatment |
| For you feed | Label All or Latest; current API returns publication order, not personalized recommendations |
| Following tab | Omit; follows are outside v1 and unsupported by the current backend |
| Adventure, Romance, etc. | Use real backend categories, not hardcoded demo categories |
| Heart/comment icons and counts | Omit; likes/comments are outside v1 and have no endpoints |
| Bottom Home / Book / Profile / Menu | Keep its pale bar and simple icon style; use Home / Explore / My Blogs / Account from spec.md |
| Author photograph | Initials fallback; public blog author data has no avatar URL |
| Author email in reader | Omit; public responses expose only author ID/display name |
| Large artwork | Use the real article cover; do not assume demo artwork is available or licensed |
| Reader's bottom reaction strip | Omit; do not reserve a sticky empty bar for unsupported actions |
| Hamburger/filter-looking icon | Give each icon a real, accessible destination; do not add a decorative menu button |

The screenshot establishes appearance, not extra product scope. Draft management and account forms follow the same material and typography but need their own functional layouts.

## 3. Color palette

Paper and navigation values below were sampled from large flat areas in the supplied PNG. Slight pixel variations are present, so these are practical palette anchors rather than original source-design tokens.

Text, borders, and state colors are proposed companion values. Their role and contrast matter more than matching antialiased text pixels in the screenshot.

### Light theme — reference direction

| Token | Hex | Role |
| --- | --- | --- |
| background | #F2EDE3 | Main paper surface: feed, reader, editor, forms |
| surface | #F7F3EA | Subtle raised/contained areas such as inputs or a sheet |
| navigation | #E8E0BC | Bottom navigation and selected filter surface |
| foreground | #24251B | Main text, active icons, headings, primary button fill |
| secondary | #5D5C52 | Excerpts, supporting text, metadata, inactive tab labels |
| muted | #6B685D | Lower-emphasis text on paper only |
| border | #D9D6C9 | Fine separators and decorative boundaries |
| control-border | #827E6C | Input boundaries when a stronger visible edge is needed |
| primary | #24251B | Primary actions; same ink tone as foreground |
| primary-foreground | #F2EDE3 | Text/icons on primary buttons |
| accent | #E8E0BC | Quiet selected backgrounds, not a bright brand accent |
| focus | #625B35 | Focus rings, selected outlines, underlined text links |
| success | #426346 | Saved/published confirmation, with text or icon |
| destructive | #963B32 | Delete, validation failures, destructive confirmation |
| overlay | #24251B at 35% opacity | Modal backdrop |

Use secondary rather than muted for text on navigation. Border is intentionally subtle and is not sufficient as the only indicator of an interactive control.

Color checks for the proposed solid colors:

| Foreground / background | Approximate contrast |
| --- | --- |
| foreground / background | 13.28:1 |
| foreground / navigation | 11.67:1 |
| secondary / background | 5.77:1 |
| secondary / navigation | 5.07:1 |
| muted / background | 4.78:1 |
| destructive / background | 6.06:1 |

These checks cover the listed opaque pairs only; overlays, disabled states, text over images, and final component combinations need implementation QA.

### Dark theme — proposed adaptation, not shown in reference

spec.md requests consistent system appearance. The image supplies light-mode authority only; the following dark palette is a proposal that needs visual review.

| Token | Hex |
| --- | --- |
| background | #1D1E18 |
| surface | #272820 |
| navigation | #343322 |
| foreground | #F2EDE3 |
| secondary | #C7C3B7 |
| muted | #B2AD9F |
| border | #45463A |
| control-border | #8E8A78 |
| primary | #E8E0BC |
| primary-foreground | #24251B |
| accent | #343322 |
| focus | #E8E0BC |
| success | #B0C9A9 |
| destructive | #F0B0A5 |
| overlay | #000000 at 55% opacity |

Keep article imagery in its original colors. Do not invert covers, use pure black across all surfaces, or replace warm paper with an unrelated blue theme.

## 4. Typography

### Font roles

The exact fonts cannot be identified reliably from this screenshot alone.

- **Editorial serif:** proposed Lora, using real Regular, Italic, and Semibold/Bold files where needed. This is a font candidate, not a confirmed identification or installed asset.
- **UI sans-serif:** platform system font for navigation, forms, dates, and compact account metadata.
- **Code:** platform monospace for Markdown code blocks.

Use a real italic serif face for headlines. Do not synthesize an extreme slant or italicize every label/body paragraph. Avoid wide tracking in article text.

Before implementation, confirm the chosen serif font and its licensing, obtain the required files, and load it through the existing Expo font setup. Keep a working serif fallback while fonts load or fail. No fonts are installed by this document.

### Type scale

Sizes below are logical React Native units at default system text size, not pixels measured directly from the shrunken phone mockups.

| Style | Size / line height | Treatment |
| --- | --- | --- |
| Wordmark | 20 / 26 | Bold italic serif |
| Screen title | 26 / 34 | Semibold serif |
| Article title | 28 / 36 | Italic serif; allow multiple lines |
| Article introduction | 18 / 27 | Regular serif |
| Article body | 18 / 29 | Regular serif |
| Article h2 | 24 / 32 | Semibold serif |
| Article h3 | 21 / 29 | Semibold serif |
| Feed title | 18 / 24 | Italic serif, generally up to 2 lines |
| Feed excerpt | 15 / 21 | Regular serif, up to 2 lines |
| Author name / metadata | 13 / 18 | UI sans; use 14 / 20 where space allows |
| Tabs / filter labels | 14 / 20 | UI sans; medium for selected item |
| Inputs / buttons | 16 / 24 | UI sans |
| Helper / error text | 13 / 19 | UI sans |
| Code | 14 / 22 | Monospace |

Support system font scaling and non-Latin content, including Myanmar text if supplied by authors. Verify fallback shaping and line height with actual content; do not assume a Latin serif covers every script.

No essential control text should be reduced to reproduce the screenshot's very small labels.

## 5. Spacing, geometry, and surfaces

Use a small spacing scale consistently:

| Token | Value | Typical use |
| --- | --- | --- |
| space-1 | 4 | Tight icon/label alignment |
| space-2 | 8 | Metadata gaps |
| space-3 | 12 | Row content gaps |
| space-4 | 16 | Default screen horizontal inset |
| space-5 | 20 | Form and reader section spacing |
| space-6 | 24 | Article paragraphs/sections |
| space-8 | 32 | Larger section breaks |
| space-10 | 40 | Empty-state separation |

- Main mobile horizontal inset: 16–20.
- Feed row vertical padding: 16; row height grows with its content.
- Hairline/approximately 1-unit separators, aligned to the content inset.
- Feed covers use the available content-column width with a 16:9 crop; missing covers leave no empty image slot.
- Feed-cover radius: 12; input/button radius: 8; bottom-sheet top corners: about 20.
- Avatars: 24 in feed rows and 36 in an article author row.
- Primary controls: at least 48 high.
- Icon touch targets: at least 44 by 44, with approximately 20–24-unit visible icons.
- No row shadows, thick card borders, oversized pills, or floating tab-bar shadows.
- Reserve rounded containers for thumbnails, controls, badges, and sheets; most content sits directly on the paper.

On larger screens, center readable content within roughly 680 logical units, with adaptive outer gutters. Let paragraph width stay comfortable rather than stretching edge to edge across a tablet.

## 6. Home feed

### Header

- Wordmark left, a useful search/explore action right.
- Align content under the real safe-area inset; never draw a fake status bar.
- Avoid duplicate menu actions when Account and Explore already expose the needed destinations.

### Category strip

- Horizontal scrolling row just below the header.
- First item All or Latest, then backend category names.
- Selected item uses dark ink, slightly stronger weight, and a thin underline.
- Use horizontal padding and spacing instead of large chip backgrounds.
- Long names remain readable and scroll naturally; do not shrink labels until they fit.
- Selection maps to an actual category filter. Following is not present.

### Article row — X-inspired revision

Order and hierarchy:

1. A 40-unit initials avatar on the left, beside the article content.
2. Compact author/date line at the top of the content column.
3. Article title and a short excerpt grouped directly below.
4. Category text and an optional wide 16:9 cover below the excerpt.
5. Fine separator; each row sizes to its content and never fills the viewport.

The author's identity is secondary to the title. Use initials if no actual avatar is available; do not invent a profile photo URL.

The entire row opens the article. Long titles can take two lines; metadata may wrap or simplify before title/body text becomes too small. Missing covers collapse the media area without reserving any empty image space.

The reference's reaction row disappears in v1. Do not replace it with invented likes, comments, reading counts, or estimated analytics.

## 7. Search and Explore

- Reuse the feed row rather than designing a second card style.
- Put a clearly labeled search field at the top, followed by concise filter controls.
- Keep selected category/tag filters visible, with Remove and Clear all actions.
- Use the pale accent sparingly for active selections.
- Open longer filter choices in a paper-colored sheet or dedicated route.
- Put author-name filtering in the filter controls rather than crowding the initial search view.
- Show results and match count only from actual backend data.
- Keep clear/retry controls visible in no-match/error states.

Do not build a large hero banner, fake trending searches, or a recommendation carousel.

## 8. Article reader

- Paper fills the screen; the visual focus is the headline, prose, and optional cover.
- Top toolbar has Back and only necessary supported actions.
- Then title, optional introductory text when real content supplies it, publication/category metadata, and author display name.
- The backend does not provide a separate subtitle. Do not invent a second factual headline or duplicate the excerpt as a required standfirst.
- Display the optional cover between the heading section and body, following the reference's image-led rhythm.
- Use full content width inside the reading layout for the cover. Preserve aspect ratio and avoid forcing every cover into the screenshot's tall portrait crop.
- Body continues below the cover; do not end the article at the image.
- No fixed reaction footer; content can use the available viewport.
- Render links with underline plus a visible ink/focus color, not color alone.
- Use subtle surface backgrounds for code and a simple vertical rule for blockquotes.
- Lists, tables, code, images, and long URLs must not break the overall reading width.
- Empty/missing covers collapse naturally.
- Unavailable articles show a short explanation and Back to browsing action.

For content that has no cover or introduction, move directly from real metadata into body text without large empty placeholders.

## 9. Bottom navigation

Use the react_native_recurrly floating navigation layout, as requested in the latest revision: dark ink bar, rounded corners, icon-only destinations, and a pale-butter circular active indicator.

| Label | Suggested icon meaning | Destination |
| --- | --- | --- |
| Home | House | Latest public feed |
| Explore | Search | Search and filters |
| My Blogs | Page/pen | Own drafts and published posts |
| Account | Person | Account and settings |

- Four evenly distributed destinations.
- Active icon becomes filled inside a 48-unit circular pale-butter indicator; visual labels are hidden, with accessible tab labels retained.
- Inactive icons use warm cream against the dark ink navigation surface.
- Bar height 72, horizontal inset 20, corner radius 32; bottom offset is the larger of the device safe-area inset and 20.
- Floating, attached to the screen through a safe-area-aware bottom offset; keep feed padding sufficient so the last article can scroll clear of it.
- Avoid fixed positions calculated from screenshot coordinates.
- On reader/editor secondary screens, prioritize Back and the task's actions rather than showing redundant navigation everywhere.
- Guest My Blogs/Account routes retain this visual system and present sign-in actions without blocking reading.

## 10. Writing and personal screens

These screens are not shown in the reference. The following extends its visual language while following spec.md.

### My Blogs

- Serif title, concise Write action, and All / Drafts / Published filters.
- Reuse article-row typography and fine dividers.
- Include an explicit status label; add a clearly worded moderation warning when blocked.
- Use body text/icons as well as color to distinguish states.
- Published and draft entries should not look like separate unrelated products.

### Editor

- Paper background, serif title field, and a comfortable multiline content area.
- Clear Write / Preview switch with an underline treatment matching category selection.
- Labeled category, tags, and cover controls below or in a focused editor section.
- Save draft is secondary; Publish is the primary ink-filled action.
- Published-post editing has an explicit Save changes action; Unpublish is separate.
- Controls respect the keyboard and safe area.
- Keep action text visible while saving; add a progress indicator and prevent repeat submissions.
- Warn clearly before discarding unsaved edits or deleting a blog.
- Show moderation blocks near publication actions, with a readable explanation.
- Cover upload privacy information should be concise and close to that action.

### Authentication and account

- Small serif brand/title; readable sans-serif form labels.
- Fields use the surface token, visible control borders, and generous input height.
- Errors appear beside the relevant field with text, not just red outlines.
- Ink-filled primary button; secondary navigation as underlined text or a simple outline control.
- Avoid giant decorative artwork or repeated promotional copy on account forms.
- Profile/notification lists use simple rows and separators.

### Notifications

- Serif screen title, readable sans-serif message text, small timestamps.
- Unread entries use a dot plus text/weight distinction.
- Deleted-post notifications remain understandable without a thumbnail or working article link.

## 11. Interaction and states

- Press feedback: small opacity/background change, without bouncing an entire article row.
- Selection: underline, icon/weight change, or a quiet accent surface.
- Loading: restrained skeleton rows or a simple progress indicator; honor reduced-motion preferences.
- Refresh failure: retain loaded content and offer retry.
- Pagination failure: show retry after existing content.
- Empty state: one clear heading, short supporting sentence, and one useful action.
- Success: concise inline feedback such as Draft saved; do not cover reading content with a large celebration.
- Destructive confirmation: explicit article title/context with Delete and Cancel.
- Image failure: paper/surface fallback and preserved text layout.
- Keep motion brief and purposeful. No automatic cover zoom, pulsing reading text, or animated gradients.

Do not add interaction logic, native libraries, or animation dependencies during documentation work.

## 12. Accessibility and responsive rules

- Respect iOS/Android safe areas once, including any fixed bottom actions.
- Account for keyboard overlap in search/forms/editor.
- Maintain readable contrast and text scaling.
- Use labels for icon-only controls; selected tab/filter state must be available to assistive technology.
- Read the article title/author/content in a logical order.
- Covers should have meaningful alternative text only when meaningful text is available; do not invent image descriptions from filenames.
- Do not rely on thumbnail colors, subtle separators, or italic type alone to communicate functionality.
- At narrow widths and large font sizes, let rows grow, reduce thumbnail prominence, and wrap labels.
- Use vertical scrolling instead of clipping content.
- Never hardcode the reference phone's dimensions as the application layout.

## 13. Future implementation mapping

This section names the intended organization, not files to create now.

- Define semantic NativeWind color/type/spacing tokens in the existing CSS/theme configuration.
- Keep any TypeScript color values needed by navigation APIs consistent with the same token definitions.
- Use readable className styling and a small set of reusable patterns, following react_native_recurrly.
- Likely shared elements: article row, author identity, category strip, labeled input, action button, state message.
- Reuse components only when multiple real screens need them.
- Keep routes in src/app and supporting components/types/hooks/API logic outside it.
- No design-system framework, component library, or package-version changes are required by this document.
- Do not create unused styles for likes, comments, bookmarks, follows, or chat.

## 14. Visual review checklist

Before a later implementation is called complete:

1. Home and reader clearly resemble the supplied reference in paper color, serif hierarchy, row density, fine rules, and navigation tone.
2. Text is readable at actual device size rather than copied at screenshot scale.
3. Palette values are applied consistently and interactive text meets contrast requirements.
4. Real API content replaces all reference names, emails, titles, counts, and artwork.
5. Missing covers/avatars/categories and long content remain visually intentional.
6. Category selection and navigation reflect actual v1 behavior.
7. Reader content continues beyond the cover and has no unsupported reaction footer.
8. Editor/account/notification surfaces feel part of the same product.
9. Safe areas, keyboard behavior, large text, and accessibility work on iOS and Android.
10. The proposed dark adaptation receives its own visual review rather than being assumed to match an unseen reference.

## 15. Confirmed vs. proposed

Confirmed by the user's reference: warm cream paper, pale-yellow navigation, dark ink, serif-led editorial typography, compact divided rows, small covers, and a clean image-led reader.

Proposed for implementation review: exact companion colors, the dark palette, Lora as the serif candidate, logical type/spacing sizes, icon choices, and writing/account layouts.

Only design.md is created for this task. spec.md remains the product-scope reference. No screens, fonts, images, packages, CSS, or backend behavior are implemented or changed.

## 16. User revision — 2026-10-30

- Article feed rows now follow an X-style avatar/content layout with a wide cover below the text.
- The header and category strip are compact, non-growing siblings of the scrolling feed.
- Bottom navigation follows react_native_recurrly: rounded dark floating bar, icon-only tabs, and a circular active indicator in BlogHub's pale-butter accent.
- Keep only implemented Home and Explore destinations until the authentication/writing steps add real screens.
- This revision supersedes the original right-thumbnail feed and attached bottom-bar instructions. Product features and reader-detail behavior are unchanged.

## 17. Compact typography and glass navigation — 2026-10-30

- Use explicit pixel font sizes and line heights in NativeWind text classes. The installed RC engine can reinterpret standard text/leading combinations as a font-size multiplier, producing hundreds of pixels of unwanted vertical space.
- Avatar initials use a 20px line height. Author and date share a compact, vertically centered header immediately to the right of the 40px avatar.
- Tab items and icon frames explicitly center their contents. Icon glyphs use a 24px line height.
- The floating navigation surface uses a dark translucent BlurView with a faint light outline and the existing circular active indicator. iOS uses native material blur; Android currently uses translucent tint until an explicit blur target is introduced.

## 18. Tab-bar refinement — 2026-10-30

- Replace the heavy dark tab-bar fill with a transparent, lightly gray-tinted ultra-thin material blur. Keep intensity modest and the edge softly translucent.
- Center each icon inside its full-height tab button, overriding the native tab item's top-aligned inner button. Raise both icon frames by 3 units for the requested optical alignment.
- Use theme-appropriate ink icons and a subtle translucent active circle rather than a solid yellow indicator.
