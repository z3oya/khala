import { call } from "../lib/rpc";

export interface GreetRecord {
  name: string;
  greeting: string;
  atMs: number;
}

export interface GreetOut {
  greeting: string;
  history: GreetRecord[];
}

export interface HistoryOut {
  history: GreetRecord[];
}

export interface InfoOut {
  name: string;
  version: string;
  gitHash: string;
}

export const api = {
  greet: (name: string) => call<{ name: string }, GreetOut>("greet", { name }),
  reset: () => call<Record<string, never>, HistoryOut>("reset", {}),
  info: () => call<Record<string, never>, InfoOut>("info", {}),
} as const;
