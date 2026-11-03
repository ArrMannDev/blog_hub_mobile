# Online/offline post CRUD

The post form uses NetInfo to choose its save path:

- Online: send the existing authenticated REST request immediately, then cache the confirmed response. A SQLite cache failure never turns a confirmed creation into a request to create it again.
- Offline: save the post and its queued operation together in SQLite. Cover selections are copied to the account's document directory first. The form says **saved on this phone**, not published.
- A post that already has unsynced edits continues using its local queue, even after reconnection, so a new save cannot bypass earlier changes.
- An online timeout is an uncertain server outcome. The form retains its text and asks the author to check Profile. It never silently queues a second creation after an ambiguous online POST.

On iOS and Android, a new post without a category always saves locally, even if NetInfo reports online or unknown connectivity. No token or creation request is needed for that save. Category/tag loading failures cannot block it. The queued creation stays held until a category is selected. Web continues to require a category because it has no native SQLite fallback.

## Automatic upload

`PostSyncProvider` runs while the app is active, on launch, foreground entry, restored connectivity, and local changes. It pauses when the app backgrounds or the account changes. It retries temporary errors with exponential backoff. There is no promise of uploading while the app is terminated.

Every queued operation keeps its UUID, entity UUID, payload, and expected server version across retries. The backend atomically stores a receipt with the mutation. A lost response can therefore be retried without another post or upload. Following unattempted edits advance their version only after our preceding operation is confirmed. An uncertain operation's payload is never changed.

Validation/permission errors stop automatic retries. Correcting a definitively rejected post replaces the rejected queue with its current values. Version conflicts preserve local text and require review. Profile shows pending changes and issues, including failed deletions. **Discard local changes** explicitly confirms losing unsynced edits and then fetches the server copy; it cancels a pending deletion too.

Own posts are refreshed using complete, keyset-paginated snapshots. Missing synced rows are removed only after every page succeeds, and only if that local row did not change during the scan. Dirty local posts are never removed by this reconciliation. Public feeds are invalidated after confirmed background uploads.

## Accounts and local access

Each account has its own SQLite database and cover directory. An active session's last confirmed profile is stored in SecureStore to unlock that account's local posts when launching offline. This profile is not an API credential: uploads still require a valid backend token. Signed-out markers prevent restoring a previous account. Tokens remain in memory/HttpOnly cookies; no Supabase key is added to the app.

Categories are cached after loading and prefetched on connection. Optional tags can be omitted when no cached tag list exists. Offline creation works without downloaded categories: save text and covers locally, preserving the selected draft/publish intent. Posts without a category are held without upload attempts or retry timers. Profile shows **Choose a category to upload** and a link into the editor. Reconnect, choose a category, and save; the unsent creation is rebuilt atomically with the latest content, tags, and cover, then uploads automatically once. Other ready posts continue uploading. Online creation still requires a category. Offline editing of server posts needs a cached full post; background synchronization downloads these. Web retains online CRUD; native SQLite offline mode is for iOS/Android.

## Backend rollout required

The backend changes are in the local backend project, not automatically deployed to Render.

1. Deploy the updated backend source with the new migration included.
2. Run `npm run migration:run` in the backend environment configured for the intended database before starting the new server version. Migration `AddPostSync1793664000000` adds versions, version triggers, and private idempotency receipts.
3. Confirm Swagger exposes authenticated `GET` and `POST /api/v1/me/blog-sync`.
4. Reload the mobile app. In Profile, retry uploads if they were waiting for the backend rollout.

Use the existing Render database and Supabase Storage environment variables. No new mobile secret is needed. Do not delete `post_sync_operations` receipts while a mobile device might retry an old operation. Older cached server posts without a verified version require review rather than guessing a version and overwriting newer content.

## Verification

```powershell
node --env-file=.env.example --experimental-strip-types --test tests/offline.test.mjs tests/post-sync.test.mjs
npm test
npx tsc --noEmit
npm run lint
```

On a phone, sign in online and open Profile and the post form once. Enable airplane mode, create a post with a cover, edit it, and restart the app. Check that its text, cover, and pending indicator remain. Delete an unsent post and verify it disappears. Restore connectivity with the app open and confirm each remaining post uploads once. Separately edit a cached post from another device before uploading an offline edit: the local edit should become a conflict, preserving both versions for review. Switch accounts and verify private posts do not cross accounts.

The automated tests use real desktop SQLite for SQL/transactions/reopening and a simulated native filesystem and REST boundary. They do not replace device tests or a PostgreSQL migration/integration run. Abrupt termination between copying a cover and committing its local row can leave an unused file. Old cover files remain while queued operations could need them; automated orphan-file collection is not implemented yet.
