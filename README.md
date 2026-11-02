# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## BlogHub mobile authentication

The Profile icon is the third destination in the floating tab bar. Guests can keep reading or open sign-in, registration, and password recovery. Signed-in users can view/edit their profile, change their password, and sign out.

`src/contexts/AuthContext.tsx` exports `AuthContext`, `AuthContextProvider`, and `useAuth()`. UI components call the hook; `src/lib/auth-api.ts` owns endpoint calls. Protected features can obtain a current bearer token with `await getAccessToken()` from the context.

Authentication uses the existing BlogHub backend, not Clerk. Access tokens live only in memory. Expo's native fetch implementation manages the backend's HttpOnly refresh cookie. SecureStore contains only a session recovery marker, never a password, access token, or copied cookie.

Native cookie requests send the confirmed allowed Origin `https://blog-hub-frontend-one.vercel.app`. To use another backend-allowed origin, set `EXPO_PUBLIC_AUTH_ORIGIN` in `.env.local` and restart Expo. This is public configuration, not a secret. Browser clients use their real browser Origin; adding a header cannot bypass browser CORS or SameSite cookie rules.

Refresh calls share one in-flight request. The recovery marker is set before rotation; failed or interrupted rotation requires a fresh sign-in instead of replaying a possibly consumed cookie. Login and account mutations cannot submit concurrently, and write requests are not automatically retried. A failed logout keeps the account visible and offers retry rather than claiming that its server session was revoked.

Registration does not sign in automatically. Password changes and resets clear local authentication. Google sign-in, writing screens, and notifications remain separate implementation steps.

### Verification still required on devices

The public CORS preflight confirms the supplied Origin, but does not prove login/cookie behavior. No production account was created or changed for testing.

On both iOS and Android, check sign-in with an existing test account, background/resume, refresh after access-token expiry, app force-close/restart, sign-out, and restart after sign-out. Also check recovery email delivery, profile/email/password changes, keyboard behavior, large text, and dark mode. Cookie retention/rotation across an immediate force-close needs particular attention. Do not call persistent native authentication verified until these checks pass.

Browser preview is not evidence of native cookie persistence. Cross-site browser refresh may be blocked by the backend's SameSite=Lax policy. The current development web preview also shows server-rendering/styling problems; this mobile change does not change web deployment configuration.

Run `npm test`, `npm run lint -- --no-cache`, and `npx tsc --noEmit` for the local checks.
## Own posts and editing

Profile now shows only the current account's Published and Draft posts, using the protected /me/blogs endpoints. Open a draft or tap Edit post to edit the title/content and preview Markdown. Save changes preserves publication status, category, tags, and cover. Profile refreshes when returning from the editor; public feed caches are invalidated after successful edits.

Account actions remain available under Edit profile and Account above the timeline. Private list state is discarded when signing out or switching accounts. Failed saves keep editor text, and leaving with unsaved changes asks for confirmation. Force-closing the app does not save unsaved edits.

The user reports testing the earlier authentication flows. The new profile/edit flows still need a phone check: Published/Drafts filtering, another account's isolation, pagination, editing both statuses, back/swipe-back protection, save failure/retry, and return-to-profile refresh. Creation, cover replacement, publication controls, and deletion are not included in this increment.
### Publishing and moving back to drafts

Edit post now includes Publish post for a draft and Move to draft for a published article. These actions save the current title/content and change status in one request; Save changes alone preserves status. After moving a post to drafts, find it under Profile > Drafts. Moderation-blocked drafts can still be edited but cannot be published through this editor. New-post creation, cover replacement, and deletion remain separate steps.
### Creating a post

Sign in, then tap + beside Search on Home. Enter a title and content, choose an existing category, and select Save draft or Publish post. Later saves update the created post using its returned ID. Check Profile > Drafts or Published to find it. Search remains in the Home header; the bottom bar now shows Home and Profile.

If a creation request's outcome is uncertain, the form preserves text and disables another POST. Check Profile before starting another creation to avoid duplicates. Category/tag creation, cover uploads, and post deletion are not part of this step.
### Updated bottom navigation

The latest design moves + into the center of an attached dark bottom bar between Home and Profile. Sign in, then tap the center + to create a post. Guests are sent to sign-in. Search stays at the top of Home; the header no longer has a + action. This replaces the earlier floating glass bar and header-create instructions.
### Categories and tags

Choose one required category when creating a post. Tags are optional; select up to 10 from that category. Changing the category clears its tag selections. The article reader labels Category and Tags separately. The navigation, badges, and avatar backgrounds now use pale sage green with warm cream and dark ink.
### Managing posts on Profile

Tap … beside an own post to open Edit post, Publish/Move to draft, or Delete post. Deletion asks for confirmation and permanently removes the post; there is no trash or restore. Status changes preserve content. Profile and public caches refresh after successful actions, while failed requests leave the options open for retry. Check the new sheet, dismissal, editing, status changes, and confirmed deletion on a phone before release.

### Category and tag management

Open **Profile → Account → Categories and tags**, or **Manage categories and tags** in the post composer. Open a category to manage its tags. Authors can add entries and rename/delete their own. Admins can rename only their own entries and delete any entry. Direct rename links verify ownership from the API before showing a form, including for admins. Deleting a category also deletes all child tags, while preserving posts as Uncategorized. Renames change public filter slugs. Lists refresh on return; the composer reloads category/tag choices. Redeploy the backend with creator-or-admin deletion permissions. No new dependencies are required.


### Cover images and post metadata

Create/Edit now share a composer for category, tags, and cover images. Choose a JPEG, PNG, or WebP image up to 5 MiB, replace it, remove it, or undo a cover change before saving. Cover changes and tag/category changes can be saved without editing text. Uploads preserve selections on errors; updates preserve metadata that was not changed. Draft covers are public, and removing a cover does not erase the old storage file.

The SDK-compatible expo-image-picker dependency is installed. Restart Expo (`npx expo start --clear`). If using a custom development client, rebuild it for the added native module and permission configuration. Photo access, device uploads, safe areas, and keyboard behavior need a real-phone check.

### Notifications and post history

Open **Profile → Notifications** for moderation notices and Mark as read/Mark all as read. Deleted-post notices have no live-post link. Open **Profile → Post history** for your recorded actions, before/after values, and deletion snapshots. History starts at recorded changes rather than creation; another admin's moderation actions appear in your notifications, not your action history. These features use existing protected backend endpoints and do not provide push notifications or restoration.

### Backend URL configuration

Copy `.env.example` to `.env` when setting up a new checkout. Set `EXPO_PUBLIC_API_URL` to the backend origin (without `/api/v1`). API requests and legacy image paths use this value; no backend host is hardcoded in app source. Reload the app after editing it. Set the same variable in your build environment for hosted builds. `.env` files are ignored by Git; `.env.example` is the tracked template. Public Expo variables are included in the app, so never put secret credentials there. Tests load the template using Node's `--env-file` option and need no private `.env` file.

### Native upload compatibility fix

Expo SDK 58's expo/fetch rejects React Native FormData entries shaped as `{ uri, name, type }` before sending the request. Native cover uploads now append `new File(uri)` from expo-file-system; web still appends the picker's browser File. The existing Expo-bundled FileSystem module is declared directly without upgrading it. Regression checks use the installed Expo multipart serializer, confirm the old URI entry fails, and verify the replacement serializes image bytes and headers. Retry on a phone after reloading the app and reopening the composer; no production post was created by verification.

### Private chat

Tap the message icon to the right of Search on Home, or **Profile → Inbox**. Tap an author's avatar or name in the feed or article details, then **Send message** in the profile popup to start/reopen a conversation. Sign-in is required and you cannot message yourself. Inbox shows previews and unread counts; conversations support real-time plaintext messages, older history, Sent/Read status, typing, and explicit retry after failed/unconfirmed sends. Hold your own sent message to delete it for everyone; a deleted placeholder remains. Admins cannot delete another sender's messages.

The connection uses `EXPO_PUBLIC_API_URL` with namespace `/chat` (outside `/api/v1`) and the existing BlogHub access token. Native handshakes reuse the allowed auth Origin. The new ChatContext/useChat and conversation/message hooks manage lifecycle and private state. The transport does not buffer offline sends; Retry keeps the same message ID to prevent duplicates. Drafts and pending messages are held in memory only and are cleared on logout/account change or app restart. Reconnection refreshes canonical history rather than relying on missed socket events.

Installed Socket.IO client and SDK-compatible expo-crypto. Restart Expo; rebuild a custom development client if it lacks the added crypto module. The backend needs its existing chat and message-deletion migrations applied; none were run on production here. Deployed REST paths and rejection of an invalid socket token were verified. A local Socket.IO integration check used simulated users without production messages.

For device verification, use two accounts: open an author popup and Send message, send in both directions, confirm Inbox counts/read status/typing, disconnect and retry a send, then delete your own message and confirm the placeholder on both phones. Check keyboard/safe-area behavior and logout/account switching. Real-account messaging and deployed migration readiness were not verified automatically.
