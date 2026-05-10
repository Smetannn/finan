import { apiClient } from "./client";

export type GroupListItem = {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
  role: "owner" | "member";
  memberCount: number;
};

export type GroupRow = {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
};

export type GroupMemberRow = {
  userId: number;
  name: string;
  email: string;
  role: "owner" | "member";
};

export type GroupDetailResponse = {
  group: GroupRow;
  members: GroupMemberRow[];
};

export async function fetchGroups(): Promise<GroupListItem[]> {
  const { data } = await apiClient.get<GroupListItem[]>("/groups");
  return data;
}

export async function createGroup(name: string): Promise<GroupRow> {
  const { data } = await apiClient.post<GroupRow>("/groups", { name });
  return data;
}

export async function fetchGroup(id: number): Promise<GroupDetailResponse> {
  const { data } = await apiClient.get<GroupDetailResponse>(`/groups/${id}`);
  return data;
}

export async function inviteMember(groupId: number, email: string): Promise<void> {
  await apiClient.post(`/groups/${groupId}/invite`, { email });
}

export async function deleteGroup(id: number): Promise<void> {
  await apiClient.delete(`/groups/${id}`);
}

export async function leaveGroup(id: number): Promise<void> {
  await apiClient.delete(`/groups/${id}/leave`);
}
