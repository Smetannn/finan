import { apiClient } from "./client";

export type CategoryRow = {
  id: number;
  name: string;
  type: "income" | "expense";
  icon: string;
  color: string;
  userId: number | null;
};

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data } = await apiClient.get<CategoryRow[]>("/categories");
  return data;
}
