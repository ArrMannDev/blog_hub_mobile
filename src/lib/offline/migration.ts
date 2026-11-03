import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 2;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL;");

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.getFirstAsync<{
      user_version: number;
    }>("PRAGMA user_version;");

    const currentVersion = result?.user_version ?? 0;

    if (currentVersion > DATABASE_VERSION) {
      throw new Error("This database requires a newer version of the app.");
    }

    if (currentVersion < 1) {
      await transaction.execAsync(`
        CREATE TABLE posts (
          id TEXT PRIMARY KEY NOT NULL,
          author_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,

          category_id TEXT,
          tag_ids TEXT NOT NULL DEFAULT '[]',
          cover_image_url TEXT,
          local_image TEXT,

          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'published')),

          server_version INTEGER,
          local_revision INTEGER NOT NULL DEFAULT 1,

          sync_status TEXT NOT NULL DEFAULT 'pending'
            CHECK (
              sync_status IN (
                'pending',
                'synced',
                'failed',
                'conflict'
              )
            ),

          is_deleted INTEGER NOT NULL DEFAULT 0
            CHECK (is_deleted IN (0, 1)),

          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX posts_author_status
          ON posts (author_id, is_deleted, status, created_at);

        CREATE TABLE sync_queue (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_id TEXT UNIQUE NOT NULL,
          entity_id TEXT NOT NULL,

          operation_type TEXT NOT NULL
            CHECK (
              operation_type IN ('CREATE', 'UPDATE', 'DELETE')
            ),

          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,

          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (
              status IN ('pending', 'failed', 'conflict')
            ),

          last_error TEXT
        );

        CREATE INDEX sync_queue_entity
          ON sync_queue (entity_id, sequence);

        PRAGMA user_version = 1;
      `);
    }
    if (currentVersion < 2) {
      await transaction.execAsync(`
        CREATE TABLE offline_cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        ALTER TABLE posts ADD COLUMN cached_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN scan_id TEXT;
        PRAGMA user_version = 2;
      `);
    }
  });
}
