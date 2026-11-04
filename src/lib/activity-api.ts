import type {
    PostAction,
    PostActionDetail,
    PostNotification,
    PrivatePage,
} from "@/types/activity";
import { request } from "./api";

export const activityApi = {
  notifications: (page: number, token: string, signal?: AbortSignal) => {
    return request<PrivatePage<PostNotification>>(
      `/me/notifications?page=${page}&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
  },
  markRead: (id: string, token: string) => {
    return request<PostNotification>(
      `/me/notifications/${encodeURIComponent(id)}/read`,
      { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
    );
  },
  markAllRead: (token: string) => {
    return request<{ updated: number }>("/me/notifications/read-all", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  history: (page: number, token: string, signal?: AbortSignal) => {
    return request<PrivatePage<PostAction>>(
      `/me/blog-audit-logs?page=${page}&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
  },
  action: (id: string, token: string, signal?: AbortSignal) => {
    return request<PostActionDetail>(
      `/me/blog-audit-logs/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    );
  },
};
