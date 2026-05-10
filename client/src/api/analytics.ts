import { apiClient } from "./client";

export type MonthlyDataPoint = {
  month: string;
  income: number;
  expenses: number;
};

export type ForecastResponse = {
  avgIncome: number;
  avgExpenses: number;
  forecastBalance: number;
  forecastSavings: number;
  monthlyData: MonthlyDataPoint[];
};

export type TipsResponse = {
  tips: string;
};

export async function fetchTips(): Promise<TipsResponse> {
  const { data } = await apiClient.get<TipsResponse>("/analytics/tips");
  return data;
}

export async function fetchForecast(): Promise<ForecastResponse> {
  const { data } = await apiClient.get<ForecastResponse>("/analytics/forecast");
  return data;
}
