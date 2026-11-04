export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: "author" | "admin" | "super_admin";
  permissions?: string[];
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface ProfileInput {
  displayName: string;
  email: string;
  currentPassword?: string;
}
