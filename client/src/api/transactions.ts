import { apiClient } from "./client";

export type TransactionRow = {
  id: number;
  userId: number;
  groupId: number | null;
  categoryId: number;
  amount: string;
  type: "income" | "expense";
  description: string | null;
  date: string;
  createdAt: string;
  categoryName: string;
};

export type ListTransactionsParams = {
  month?: string;
  type?: "income" | "expense";
  categoryId?: number;
  groupId?: number;
};

export async function fetchTransactions(params: ListTransactionsParams): Promise<TransactionRow[]> {
  const { data } = await apiClient.get<TransactionRow[]>("/transactions", { params });
  return data;
}

export type AddTransactionInput = {
  categoryId: number;
  amount: number;
  type: "income" | "expense";
  description?: string;
  date: string;
  groupId?: number;
};

/** Ответ POST может не содержать categoryName — список обновляется через invalidate. */
export type TransactionCreated = Omit<TransactionRow, "categoryName"> & { categoryName?: string };

export async function addTransaction(body: AddTransactionInput): Promise<TransactionCreated> {
  const { data } = await apiClient.post<TransactionCreated>("/transactions", body);
  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  await apiClient.delete(`/transactions/${id}`);
}
