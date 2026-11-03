import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { migrateDatabase } from "./migration";

const databases = new Map<string, Promise<SQLiteDatabase>>();
const writes = new WeakMap<SQLiteDatabase, Promise<void>>();

export function writeTransaction(
  db: SQLiteDatabase,
  task: Parameters<SQLiteDatabase["withExclusiveTransactionAsync"]>[0],
): Promise<void> {
  const result = (writes.get(db) ?? Promise.resolve()).then(() =>
    db.withExclusiveTransactionAsync(task),
  );
  writes.set(
    db,
    result.then(
      () => {},
      () => {},
    ),
  );
  return result;
}

async function initializeDatabase(userId: string): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(`bloghub-${userId}.db`);

  try {
    await migrateDatabase(db);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => {
      // Preserve the original initialization error.
    });
    throw error;
  }
}

export function getAccountDatabase(userId: string): Promise<SQLiteDatabase> {
  const accountId = userId.toLowerCase();

  const isValidId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      accountId,
    );

  if (!isValidId) {
    return Promise.reject(new Error("A valid user ID is required."));
  }

  const existing = databases.get(accountId);
  if (existing) return existing;

  const connection = initializeDatabase(accountId).catch((error) => {
    databases.delete(accountId);
    throw error;
  });

  databases.set(accountId, connection);
  return connection;
}
