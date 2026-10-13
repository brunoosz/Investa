import type { UserDataMap } from "./types";

export const SIMULATOR_START_CASH = 100_000;

export function defaultUserData(): UserDataMap {
  const now = new Date().toISOString();
  return {
    profile: {
      onboarded: false,
      salary: 0,
      extraIncome: 0,
      fixedExpenses: 0,
      variableExpenses: 0,
      monthlyInvest: 0,
      emergencyReserve: 0,
      invested: 0,
      debts: 0,
      riskProfile: "conservador",
      experience: "nunca",
      mainGoal: "reserva",
      updatedAt: now,
    },
    settings: {
      theme: "dark",
      desktopNotifications: true,
      smartAlerts: true,
      marketEvents: true,
      dailyTip: true,
      weeklySummary: true,
      gainThreshold: 10,
      lossThreshold: 10,
      deviationThreshold: 5,
      hiddenCategories: [],
      hiddenSymbols: [],
      customSymbols: [],
      favorites: ["^BVSP", "USDBRL=X", "PETR4.SA", "VALE3.SA", "ITUB4.SA", "BTC-USD"],
      runInBackground: false,
      aiInsight: true,
      aiInsightHour: 9,
      ownerAiAlerts: true,
    },
    portfolio: [],
    goals: [],
    expenses: [],
    alerts: [],
    learning: { xp: 0, completed: {}, streak: { count: 0, lastDate: "" }, badges: [] },
    simulator: { cash: SIMULATOR_START_CASH, startedAt: now, positions: [], history: [] },
    chat: [],
    invoices: [],
    accounts: [],
    bills: [],
    memory: [],
    planned: [],
    wealth: {},
    boxes: [],
  };
}
