import { apiClient } from "./client";
import type { AuthUser } from "../store/authStore";

export type PublicUser = AuthUser & {
  createdAt?: string;
};

export type UpdateProfileBody = {
  name?: string;
  email?: string;
};

export type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};

export async function updateProfile(body: UpdateProfileBody): Promise<PublicUser> {
  const { data } = await apiClient.patch<PublicUser>("/users/me", body);
  return data;
}

export async function changePassword(body: ChangePasswordBody): Promise<void> {
  await apiClient.patch("/users/me/password", body);
}

export async function deleteAccount(): Promise<void> {
  await apiClient.delete("/users/me");
}
