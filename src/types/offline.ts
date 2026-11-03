import type { BlogStatus } from "./blog";

export type SyncStatus = "pending" | "synced" | "failed" | "conflict";

export interface LocalPost {
  id: string;
  author_id: string;
  title: string;
  content: string;
  category_id: string | null;
  tag_ids: string;
  cover_image_url: string | null;
  local_image: string | null;
  status: BlogStatus;
  server_version: number | null;
  local_revision: number;
  sync_status: SyncStatus;
  is_deleted: 0 | 1;
  created_at: string;
  updated_at: string;
  cached_at?: number;
  scan_id?: string | null;
}

export interface SyncOperation {
  sequence: number;
  operation_id: string;
  entity_id: string;
  operation_type: "CREATE" | "UPDATE" | "DELETE";
  payload: string;
  attempts: number;
  next_attempt_at: number;
  status: "pending" | "failed" | "conflict";
  last_error: string | null;
}

export interface SyncPayload {
  revision: number;
  baseVersion?: number | null;
  input?: import("./blog").BlogEdits;
}
