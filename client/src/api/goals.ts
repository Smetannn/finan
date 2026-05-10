import { apiClient } from "./client";

export type GoalRow = {
  id: number;
  userId: number;
  groupId: number | null;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string;
  createdAt: string;
};

export type AddGoalInput = {
  name: string;
  targetAmount: number;
  deadline: string;
  groupId?: number;
};

export async function fetchGoals(groupId?: number): Promise<GoalRow[]> {
  const params = groupId !== undefined ? { groupId } : undefined;
  const { data } = await apiClient.get<GoalRow[]>("/goals", { params });
  return data;
}

export async function addGoal(body: AddGoalInput): Promise<GoalRow> {
  const { data } = await apiClient.post<GoalRow>("/goals", body);
  return data;
}

export async function deleteGoal(id: number): Promise<void> {
  await apiClient.delete(`/goals/${id}`);
}

export async function contributeToGoal(goalId: number, amount: number): Promise<GoalRow> {
  const { data } = await apiClient.post<GoalRow>(`/goals/${goalId}/contribute`, { amount });
  return data;
}
