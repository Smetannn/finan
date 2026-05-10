import axios from "axios";
import { getAuthTokenFromStorage, useAuthStore } from "../store/authStore";

export const apiClient = axios.create({
  baseURL: "http://localhost:3000/api/v1",
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token ?? getAuthTokenFromStorage();
  if (token !== null && token !== "") {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);
