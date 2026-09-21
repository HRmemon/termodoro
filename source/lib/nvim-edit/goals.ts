import { loadGoals, saveGoals, type GoalsData } from '../goals.js';

export function formatGoals(): string {
  return JSON.stringify(loadGoals(), null, 2) + '\n';
}

export function parseGoals(text: string): void {
  const parsed = JSON.parse(text) as GoalsData;
  if (parsed.version !== 3 || !parsed.weeklyPlans || !parsed.monthlyPlans || !parsed.entries || !parsed.dayQuality) {
    throw new Error('Invalid Goals file');
  }
  saveGoals(parsed);
}
