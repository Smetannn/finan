import type { AuthUser } from "../store/authStore";
import { apiClient } from "./client";

export type AuthResponse = {
  token: string;
  user: AuthUser & { createdAt?: string };
};

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/register", { email, password, name });
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", { email, password });
  return data;
}
