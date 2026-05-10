import axios from "axios";
import { apiClient } from "./client";

export type BudgetRow = {
  id: number;
  userId: number;
  groupId: number | null;
  categoryId: number;
  amount: string;
  month: string;
  createdAt: string;
};

export type AddBudgetInput = {
  categoryId: number;
  amount: number;
  month: string;
};

export async function fetchBudgetsForMonth(month: string): Promise<BudgetRow[]> {
  try {
    const { data } = await apiClient.get<BudgetRow[]>(`/budgets/${month}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return [];
    }
    throw err;
  }
}

export async function addBudget(body: AddBudgetInput): Promise<BudgetRow> {
  const { data } = await apiClient.post<BudgetRow>("/budgets", body);
  return data;
}

export async function deleteBudget(id: number): Promise<void> {
  await apiClient.delete(`/budgets/${id}`);
}
