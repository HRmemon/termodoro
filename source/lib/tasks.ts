import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { nanoid } from 'nanoid';
import type { Task } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function atomicWrite(data: unknown): void {
  ensureDir();
  const tmp = TASKS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, TASKS_PATH);
}

export function loadTasks(): Task[] {
  try {
    if (fs.existsSync(TASKS_PATH)) {
      return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8')) as Task[];
    }
  } catch {
    // corrupt file
  }
  return [];
}

export function saveTasks(tasks: Task[]): void {
  atomicWrite(tasks);
}

export function addTask(text: string, expectedPomodoros: number = 1, project?: string): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: nanoid(),
    text,
    completed: false,
    project,
    expectedPomodoros,
    completedPomodoros: 0,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function completeTask(id: string): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = true;
    task.completedAt = new Date().toISOString();
    saveTasks(tasks);
  }
}

export function deleteTask(id: string): void {
  const tasks = loadTasks().filter(t => t.id !== id);
  saveTasks(tasks);
}

export function incrementTaskPomodoro(id: string): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completedPomodoros++;
    saveTasks(tasks);
  }
}

export function updateTask(id: string, updates: Partial<Pick<Task, 'text' | 'expectedPomodoros' | 'project'>>): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    Object.assign(task, updates);
    saveTasks(tasks);
  }
}

export function setActiveTask(id: string | null): void {
  const tasks = loadTasks();
  for (const t of tasks) {
    t.active = t.id === id;
  }
  saveTasks(tasks);
}
