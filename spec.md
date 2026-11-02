# BlogHub Mobile — Product Specification

Status: Draft for review; no implementation authorized by this document.
Updated: 2026-10-30
Project: D:/blog_hub_mobile/bloghub-mobile
Backend: https://blog-hub-backend-cnzm.onrender.com/api/v1

## 1. Goal

Help people easily find and comfortably read blogs that interest them. Let signed-in people also write, save drafts, publish, and manage their own blogs without making the reading experience feel like an administration tool.

The first launch should open useful content immediately. Reading does not require an account.

## 2. Confirmed product decisions

The user selected these choices:

- The first version includes reading, writing, and publishing.
- Guests can browse, search, and read. Sign-in is required for personal features and writing.
- Discovery focuses on browsing and search. Bookmarks and author follows are outside v1.

The remaining screen structure and feature details below are proposed requirements for review. Visual design will follow the user's reference when supplied; this document does not prescribe a palette, font family, or final screen layout.

## 3. Audience and permissions

| Person | Mobile experience |
| --- | --- |
| Guest | Browse published posts, search/filter, read full posts, and access registration/login |
| Signed-in author | All guest features plus account settings, own blogs/drafts, create/edit/publish/unpublish/delete own blogs, create needed taxonomy, and own moderation notifications |
| Signed-in admin | Same personal mobile features as an author; administration remains outside v1 |

Registration creates an author account; there is no separate reader role in the backend. Account creation must not force someone to become a writer or complete author onboarding.

An admin account must be able to sign in, but the mobile app will not expose admin-wide user management, moderation, or deletion of other people's posts in v1.

## 4. Proposed navigation

Use four primary destinations:

1. **Home** — latest published blogs and quick access to discovery.
2. **Explore** — search, category/tag selection, and filtered results.
3. **My Blogs** — own published posts and drafts, with a clear Write action.
4. **Account** — sign-in/register entry for guests; profile, notifications, password settings, and logout for signed-in people.

Article detail, editor, taxonomy creation, authentication, and notifications open as secondary routes. An article reader should not be crowded by publishing controls.

Guests who open My Blogs see a concise sign-in invitation. After successful sign-in, return to the intended destination. Never block Home, Explore, or reading with an authentication screen.

No mandatory onboarding or preference questionnaire is required in v1.

## 5. Reading and discovery requirements

### R1. Home feed

- Load published blogs from the backend in its existing latest-publication order.
- Display title, author display name, category, publication date, an optional cover, and a short readable excerpt.
- Do not require a cover image for a card to work.
- Treat backend excerpts as Markdown-derived text; present a clean preview rather than visible formatting markers.
- Tap a post to open full content by its returned slug.
- Support pull-to-refresh and loading additional pages.
- Deduplicate merged pages by blog ID because offset pages may shift as content changes.
- Preserve the current feed position when returning from an article.
- Show initial loading, no published posts, initial error/retry, and pagination error/retry states.
- Keep existing loaded items visible when a refresh or next-page request fails.
- Do not label content Popular, Trending, Recommended, or Featured without a supporting backend contract.

### R2. Search and filters

- Search titles and blog content with a text field and a clear submit action.
- Allow one category and one tag filter at a time.
- Load tags for the selected category. Reset the selected tag when the category changes.
- Offer an optional author-name filter in the filter controls; explain through labels that it searches a name, not a unique author.
- Combine text, category, tag, and author-name filters using the existing backend AND behavior.
- Keep chosen filters visible and easy to remove; provide Clear all.
- Reset results to page 1 when the submitted search or filters change.
- Do not allow an older in-flight response to overwrite newer results.
- Trim inputs, URL-encode values, and omit empty filters rather than submitting empty strings.
- Use category/tag slugs in blog filters and category UUIDs when fetching category-specific tags.
- Unknown valid slugs can return an empty result; display No matching blogs and an easy way to clear filters.
- Do not present exact author pages or an exact author's entire feed: the backend author filter is a partial display-name match and names may repeat.
- Retain search text, filters, and position when returning from a result's detail screen.

### R3. Article reader

- Fetch full published content, not the list excerpt.
- Display title, author display name, category/tags, publication date, optional cover, and Markdown body.
- Render paragraphs, headings, emphasis, links, lists, blockquotes, code blocks, and images readably.
- Handle wide code/tables without forcing the entire article horizontally off screen.
- Support system text scaling and a comfortable line height. Do not introduce a separate font-settings screen in v1.
- Support long content, long titles, missing covers, and posts whose category has been deleted.
- Use the returned categoryName, including Uncategorized; category can be null.
- Resolve legacy /images/... URLs against the backend origin. Use absolute cover URLs directly.
- Tapping taxonomy should open the corresponding filtered discovery results.
- Back navigation restores the originating list context.
- Missing, deleted, or unpublished articles show a clear unavailable state with a route back to browsing.
- If loading fails, allow retry without an endless loading indicator.
- Handle Markdown and external links as untrusted content: no script execution; only supported safe link schemes may open.
- Offline article downloads, permanent cached content, sharing/deep-link distribution, and read-history tracking are outside v1.

## 6. Authentication and account

### A1. Registration and sign-in

- Email/password registration uses displayName, email, and password.
- Registration success leads to sign-in; the register endpoint does not issue a session.
- Sign-in uses the backend's own session system. Installed Clerk is not a reason to add a second identity system.
- Show field validation, loading, safe server errors, and a disabled submit action while submitting.
- Preserve password whitespace; normalize email consistently with the backend.
- Registration/new passwords require at least 8 characters and at most 72 UTF-8 bytes.
- Include password visibility controls with accessible labels.
- Refresh authenticated sessions when appropriate and recover cleanly to sign-in when they expire.
- Do not send guests through refresh before they can read public content.

### A2. Password recovery and settings

- Forgot password requests a six-digit emailed reset code.
- Always show the backend's generic delivery message without claiming that an account exists or email was delivered.
- Reset uses email, the six-digit code as a string, and a new password.
- Account settings show display name and email and allow changes.
- Changing email requires the current password when the normalized email differs.
- Signed-in password changes require currentPassword and newPassword.
- Successful password change/reset signs out all sessions; return to sign-in and clear local auth state.
- Logout revokes the current server session and clears local private state.
- Local sign-out must not be described as successful server revocation if the logout request fails; allow retry while explaining the outcome.
- Keep guest browsing available if a personal session expires.

### A3. Mobile authentication feasibility gate

Before implementing signed-in features, prove the existing backend contract on a real target device:

- Login, refresh, and logout require an allowed Origin header and a persistent refresh cookie.
- The backend does not return refresh tokens in JSON.
- Protected calls use the bearer access token returned by login/refresh.
- The cookie is HttpOnly, SameSite=Lax, scoped to /api/v1/auth, and Secure in production.
- Verify cookie retention, rotation, app restart, and logout with the chosen native networking stack.
- Serialize refresh requests; replaying a rotated token revokes its session.
- An access token lives for one hour. The session expires seven days after login and rotation does not extend it.
- If a rotation outcome is ambiguous or the session is rejected, require sign-in instead of replaying an old cookie.
- Do not expose tokens or passwords in logs; use secure storage for persisted authentication credentials where applicable.
- If the native cookie flow cannot meet this contract, record the required backend change before proceeding. Do not silently weaken origin checks or move refresh tokens into ordinary storage.

Google login/linking is available on the backend but deferred from v1 to keep the first authentication flow focused. Its mobile OAuth audience and cookie behavior need separate verification before inclusion.

## 7. Writing and own-blog management

### W1. My Blogs

- List only the signed-in user's own blogs.
- Offer All, Drafts, and Published filters, using the supported status query.
- Show title, status, cover when present, timestamps, and moderation block state.
- Provide Write, Edit, Open published article, and Delete actions as appropriate.
- Fetch editor content through /me/blogs/:id so drafts are never loaded from the public slug route.
- Handle loading, empty lists per filter, errors/retry, and pagination.
- Refresh affected lists after successful creation, editing, publication, or deletion.
- Own-blog search is not included: this endpoint supports status and pagination only.

### W2. Editor

Required inputs:

- Title: nonblank, trimmed, up to 200 characters.
- Content: nonblank Markdown, up to 100,000 characters.
- One existing category.

Optional inputs:

- Up to 10 unique tags from the chosen category.
- One cover image.

Behavior:

- Provide clear Write and Preview modes.
- Offer Save Draft and Publish actions.
- For an existing published post, distinguish Save changes from Unpublish.
- Saving a published post's content should retain published status unless the user explicitly chooses Unpublish.
- In Preview, use the same Markdown rendering rules as the public reader.
- Category changes clear incompatible selected tags and explain that change.
- Keep entered values after validation/network failure.
- Disable repeat submission while a save/publish request is pending.
- Warn before discarding unsaved changes, including back navigation or switching away from the editor.
- V1 uses explicit server saves; no background autosave or offline editing.
- On an ambiguous create result, do not blindly resend POST and risk duplicate posts. Check My Blogs or provide a recovery action.
- On successful save, keep the returned blog ID and slug as authoritative. Blog slugs remain stable on title edits.
- Do not submit server-owned authorId, slug, publicationBlocked, timestamps, or role.

### W3. Category and tag creation

- Reuse the shared category/tag lists in the editor.
- Allow a signed-in writer to create a category when needed.
- Allow a writer to create a tag under the selected category.
- Creation takes effect immediately and uses ownership from the signed-in account.
- Names require a letter/number and 1–100 characters after whitespace normalization.
- Handle duplicate-name conflicts and refresh the list instead of silently creating alternatives.
- Category names are unique globally; tag names are unique within their category.
- Renaming/deleting shared taxonomy is outside the v1 mobile scope.

### W4. Cover images

- Allow selecting, replacing, and removing one cover image.
- Accept JPEG, PNG, or WebP up to 5 MiB; present clear unsupported/oversize messages.
- Upload through the authenticated blog create/update endpoint as multipart field image.
- Send tagIds as a JSON array string in multipart.
- Let the network library set the multipart boundary.
- Do not submit image and coverImageUrl together.
- Removing a cover uses coverImageUrl=null; omitted image fields retain the previous cover.
- Show upload/submission progress as a busy state and preserve the draft on failure.
- Explain before uploading a draft cover that uploaded cover URLs are public.
- Do not request or store Supabase server credentials in the app.
- Inline content-image upload, camera capture, cropping tools, and external cover-URL entry are outside v1.

### W5. Publishing and moderation

- Ordinary authors can directly publish their own blogs; there is no approval-request workflow.
- Owners can unpublish their own published blogs.
- Show an explicit confirmation before deleting a blog.
- A successful delete returns 204 with no JSON body; remove the blog from local lists.
- Do not offer restore: deletion leaves audit history but the backend has no restoration endpoint.
- Show publicationBlocked as a read-only moderation state.
- A blocked draft remains editable, but ordinary publishing is unavailable; explain that only an admin can republish it.
- Treat a 403 during publication as authoritative even if a cached block flag was false.
- Do not add an approval request button because no matching backend action exists.
- First publication time is retained on republishing; do not imply that republishing necessarily moves an old post to the top of Home.

## 8. Writer notifications

Include a small inbox accessible from Account so writers can understand moderation affecting their work.

- List the signed-in user's notifications, newest first, with an unread badge.
- Support marking one notification read and marking all read.
- Use unreadCount from the response, which covers all pages.
- Handle post_unpublished and post_deleted.
- An unpublished notification can lead to the author's editable draft when it still exists.
- Deleted-post notifications must remain readable without trying to open a nonexistent article.
- No push delivery or notification socket exists. Refresh when opening the inbox and on app resume where appropriate; do not promise background alerts.
- Publishing and self-actions do not produce these notifications.

## 9. Backend mapping

All paths are relative to the backend base URL. This is the subset needed for the proposed v1, not an inventory of every backend endpoint.

| Mobile capability | Existing endpoint |
| --- | --- |
| Feed/search/filter | GET /blogs?page&limit&q&category&tag&author |
| Public reader | GET /blogs/:slug |
| Category choices | GET /categories |
| Category detail if needed | GET /categories/:slug |
| Tag choices | GET /tags?categoryId=<UUID> |
| Tag detail if needed | GET /tags/:slug |
| Register | POST /auth/register |
| Sign in / rotate / sign out | POST /auth/login, /auth/refresh, /auth/logout |
| Profile read/edit | GET /auth/me; PATCH /auth/me |
| Password recovery | POST /auth/forgot-password; POST /auth/reset-password |
| Change password | POST /auth/change-password |
| Own blogs/drafts | GET /me/blogs?page&limit&status |
| Editor detail | GET /me/blogs/:id |
| Create/save/publish | POST /blogs; PATCH /blogs/:id |
| Delete own blog | DELETE /blogs/:id |
| Create category/tag | POST /categories; POST /tags |
| Notification inbox | GET /me/notifications |
| Mark notifications read | PATCH /me/notifications/:id/read; PATCH /me/notifications/read-all |

Public blog pagination defaults to page 1 and limit 10; maximum limit is 50. Page responses are { items, page, limit, total, totalPages }. Categories and tags are plain arrays.

Blog list items contain excerpt instead of full content. Details include full Markdown content. Author summaries contain id and displayName, not private emails. Dates are ISO strings. Category, cover, and publication time can be null.

Search filters: q up to 200 characters; category/tag slugs up to 500; author name up to 100. The public list does not accept a status filter. Own-blog listings do not accept public search/filter fields.

Validated write/query DTOs reject unknown properties. Handle API errors with string or array messages. Distinguish validation, authentication, permission, missing content, conflicts, upload size, rate limiting, and service availability.

The hosted deployment has not been checked for parity with the reviewed local source. Verify the required routes and production configuration before integration.

## 10. Outside v1

- Bookmarks, saved lists, likes, comments, follows, reading history, personalized recommendations, and popularity rankings.
- Offline downloads or offline authoring.
- Private chat and typing/read-receipt features, although the backend already supports them.
- Admin dashboards, user promotion/status changes, global moderation, and editing other people's posts.
- Audit-history screens and restore flows.
- Google login/linking and advanced account/provider management.
- Push notifications.
- Author profile/directory screens or an exact author-ID feed.
- Account deletion, which has no matching backend endpoint.
- Payments, subscriptions, monetization, and analytics collection.

These exclusions describe v1 scope, not missing implementation work. Revisit them only when the user expands the scope.

## 11. Usability, accessibility, and resilience

- Prioritize comfortable reading and clear navigation over decorative effects.
- Follow the design reference once provided; support system light/dark appearance consistently.
- Respect safe areas on iOS and Android without double padding or hardcoded status-bar spacing.
- Keep text inputs and editor actions usable while the keyboard is open.
- Support small and large devices, system font scaling, accessible labels, adequate contrast, and comfortable touch areas.
- Use FlatList for feed/results/own-blog/notification lists.
- Provide loading, empty, error/retry, image-failure, and unavailable-content states wherever applicable.
- Use explicit user-triggered retries for writes. Never automatically repeat a destructive operation.
- Network failure must not erase editor text.
- Avoid repeated fetches while the same action is already pending.
- Keep private account, draft, and notification state separate from public content and clear it on sign-out/account change.
- Show a bounded loading state and retry when the hosted backend is slow or unavailable; do not assume a specific Render service tier or guaranteed cold-start time.

## 12. Engineering constraints

- Follow AGENTS.md and the readable structure/style of react_native_recurrly.
- Use existing Expo SDK 58, React Native, TypeScript, Expo Router, NativeWind 5, react-native-css, and safe-area setup.
- Keep routes in src/app; put non-route components, API logic, hooks, types, and utilities outside it.
- Use NativeWind as the primary styling approach and reusable tokens for consistent styling.
- Reuse installed packages where suitable; do not upgrade versions or add packages without reviewing the existing setup.
- Read version-matched Expo documentation before using framework APIs.
- A Markdown renderer and image-library picker may require additional dependencies; assess them during their implementation steps. Do not install anything during specification work.
- Use the hosted HTTPS backend; never embed database, SMTP, JWT-signing, or Supabase service secrets.
- Keep implementation incremental and avoid generic infrastructure that the first release does not need.

## 13. Acceptance criteria

1. A fresh guest launch can reach the feed and open an article without an account prompt.
2. Search and category/tag/author-name filters use the supported API contract and return the correct matching set.
3. Returning from detail preserves the previous discovery context.
4. Long Markdown articles, missing covers, deleted categories, and unavailable posts remain usable.
5. Loading another page does not duplicate articles or erase the current list on failure.
6. A guest can sign in from My Blogs and continue to the intended destination.
7. Registration, recovery, profile changes, password changes, and logout follow the backend session contract.
8. Native-device login, cookie rotation, restart recovery, expiry, and logout pass before signed-in features are considered ready.
9. A writer can create a draft, reopen it, preview Markdown, edit it, publish, unpublish, and delete it.
10. Changing category cannot submit incompatible tags.
11. Invalid images and duplicate submissions are blocked; failed saves retain entered content.
12. A moderation-blocked post can be edited but cannot be published through the ordinary writer flow.
13. A writer can understand moderation notifications, including notifications for deleted posts.
14. Signing out or switching accounts never exposes the previous account's drafts or private data.
15. iOS/Android safe areas, keyboard behavior, large text, and basic screen-reader labels are checked.
16. Lint, TypeScript, and relevant behavior checks pass, or pre-existing limitations are explicitly recorded.

## 14. Proposed implementation sequence

Each step is separately reviewable. The user decides when implementation starts.

1. Confirm this specification and review the supplied visual design.
2. Establish navigation, design tokens, reusable basic UI, safe areas, and state/error conventions.
3. Build public Home, Explore/search/filters, and the Markdown reader against the hosted API.
4. Prove native cookie authentication, then build registration/login, account settings, and recovery.
5. Build My Blogs and the editor with draft saving, preview, taxonomy selection/creation, and cover upload.
6. Add publishing/unpublishing/deletion, moderation-block handling, and the writer notification inbox.
7. Verify real-device reading/writing flows, accessibility, failure recovery, lint, TypeScript, and platform builds.

## 15. Remaining review points

- Visual reference, branding, and final navigation layout have not been supplied.
- Four primary destinations and the smaller writing/account details are proposals for review.
- No extra discovery features are required for v1; bookmarks and follows are explicitly excluded.
- Production Origin allowlist, native cookie support, deployed API parity, SMTP, and image Storage need integration verification.
- No application code, dependencies, backend configuration, or database changes are part of creating this document.

## 16. Authentication implementation status — 2026-10-30

The user chose the existing backend authentication and authorized implementation. Added the Profile tab, email/password sign-in and registration, forgot/reset password, own-profile editing, password changes, logout, and AuthContextProvider/useAuth. The installed Clerk package is not used. Public browsing remains independent of authentication.

The native Origin is the user-confirmed `https://blog-hub-frontend-one.vercel.app`; the hosted CORS preflight accepts it. Native HttpOnly cookies and in-memory access tokens follow the existing contract. Refresh is serialized, with interrupted/ambiguous rotation requiring sign-in again. SecureStore holds only a recovery marker.

Unit/behavior checks and native bundle compilation do not satisfy the real-device authentication feasibility gate in A3. Cookie rotation, force-close/restart persistence, recovery email delivery, and full account flows still require testing on iOS and Android before signed-in features are considered release-ready. See README.md for setup and remaining verification.

My Blogs, editor/publishing, and writer notifications have not been implemented by this step.
## 17. Own posts on Profile — 2026-11-02

The user reports checking the authentication flows and authorized the next step. Their latest navigation choice places own published posts and drafts inside Profile rather than adding a separate My Blogs tab.

Profile now has a compact identity header, Edit profile, collapsible account controls, and Published/Drafts tabs. Lists use the authenticated /me/blogs endpoint, support pagination/refresh/retry, and remount on account/status changes. Drafts never use the public slug route. Published cards open the reader; each own post has an Edit action.

The protected editor reads /me/blogs/:id and updates only title and Markdown content through PATCH /blogs/:id. It includes preview, validation, duplicate-submit protection, unsaved-change confirmation, and preservation of text on failure. Publication status, category, tags, and cover remain unchanged. Returning to Profile refreshes the selected list; successful edits invalidate public feed caches.

Post creation, category/tag editing, cover replacement, publish/unpublish/delete actions, and notifications remain later steps. No backend or dependency changes are required for this increment.
## 18. Publication status in the editor — 2026-11-02

The editor now offers Move to draft for published posts and Publish post for drafts. Each explicit status action validates and saves current title/content together with the requested status. Ordinary Save changes omits status and preserves it. Status changes also work when the text has not changed. Successful changes invalidate public caches, and Profile refetches when the user returns.

Publishing is disabled when publicationBlocked is set. A server-side publishing refusal is authoritative and leaves edits intact. Duplicate writes are prevented, failed requests are not automatically retried, and the editor uses the returned status as the new saved state. Category, tags, and cover remain unchanged.
## 19. Create posts from Home — 2026-11-02

Home now shows a + action beside Search for signed-in users. Search remains available from Home while its bottom-tab icon is hidden; the visible bottom destinations are Home and Profile. Guests cannot use the protected new-post route.

The new-post form reuses the editor, with required category selection, title, Markdown content, preview, Save draft, and Publish post. A first successful save records the returned ID; later saves update that post rather than create duplicates. Successful writes invalidate public caches, and Profile refetches on return. Unknown POST outcomes disable another creation attempt and direct the user to check Profile. Definitive validation failures retain text and allow correction. Category selection is disabled while saving.

Creating categories, selecting tags, cover uploads, and deleting posts remain later increments.
## 20. Revised navigation — 2026-11-02

Per the latest reference, bottom navigation now has Home, a central create action, and Profile. The + action moves out of the Home header. Guests who tap it go to sign-in; authenticated users open the existing composer. Search remains in the Home header. The attached bar replaces the floating overlay, with safe-area handling and corresponding list-padding adjustments. Post and authentication contracts are unchanged.
## 21. Separate category and optional tags — 2026-11-02

New posts now distinguish Category (one required main topic) from Tags (optional labels, up to 10). Tags load using the selected category UUID. Changing category clears selected tags; selecting the same category retains them. Loading, empty, error/retry, selection limits, and cancellation of stale category requests are handled. Create requests include selected tag UUIDs, validated against the selected category. Existing-post editing continues to preserve taxonomy.

The article reader separately labels Category and Tags and presents tags with a # prefix. Both remain links to filtered discovery. Per user confirmation, pale green applies to the bottom navigation, badges, and profile avatars.
## 22. Profile post management sheet — 2026-11-02

Each own post now has an ellipsis button beside its byline. It opens one shared bottom sheet for the selected post, replacing the inline Edit link. Supported actions are Edit post, Publish/Move to draft, and Delete post. Status changes send only status, preserving full content. Moderation restrictions disable publishing. Successful mutations immediately remove the post from its old filtered list, refresh Profile, and invalidate public caches.

Deletion requires explicit confirmation and is permanent; no trash/restore promise or 30-day retention is shown. Failed mutations preserve the list and sheet with retryable error feedback. Duplicate requests and dismissing an active write are prevented. Pinning, bookmarks, archives, subscriptions, and albums from the visual reference are not supported actions.

## 23. Category and tag management — 2026-11-02

Signed-in users open Categories and tags from Profile → Account or the post composer. The category list opens a category's tags; each tag has one fixed parent category. Both lists support creation, renaming, refresh, loading/empty/error states, and cancellation of requests when leaving. Authors rename/delete only their own entries. Admins rename only their own entries and may delete any entry. Direct edit links load the current entry and require ownership before displaying the form, including for admins. Edit and delete use separate permission checks. Server authorization remains authoritative; this mobile revision does not change backend permissions.

Names normalize whitespace and require 1–100 Unicode characters with a letter or number. Duplicate names show the backend error without losing input. Creation with an uncertain network outcome requires checking the list before resubmitting. Writes are never automatically retried; duplicate taps are blocked. Rename requests send only name; creating a tag also sends categoryId.

Deletion requires confirmation. Deleting a category permanently removes its child tags and post-tag links; posts remain with Uncategorized. Deleting a tag removes its post links and keeps posts. Renaming changes slugs and invalidates old filter links. Successful writes invalidate public feeds. Category/tag choices reload on screen focus so returning to the composer reflects changes. The backend must be redeployed with creator-or-admin deletion guards; no dependency changes are needed.
