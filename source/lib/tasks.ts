import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { nanoid } from 'nanoid';
import type { Task } from '../types.js';
import { atomicWriteJSON } from './fs-utils.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const PROJECTS_PATH = path.join(DATA_DIR, 'projects.json');

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
  atomicWriteJSON(TASKS_PATH, tasks);
}

export function addTask(text: string, expectedPomodoros: number = 1, project?: string, description?: string): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: nanoid(),
    text,
    completed: false,
    description,
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

export function updateTask(id: string, updates: Partial<Pick<Task, 'text' | 'expectedPomodoros' | 'project' | 'description'>>): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    Object.assign(task, updates);
    saveTasks(tasks);
  }
}

export function getProjects(): string[] {
  const tasks = loadTasks();
  const projects = new Set<string>();
  // From tasks
  for (const t of tasks) {
    if (t.project) projects.add(t.project);
  }
  // From explicit projects file
  for (const p of loadProjects()) {
    projects.add(p);
  }
  return [...projects].sort();
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export function loadProjects(): string[] {
  try {
    if (fs.existsSync(PROJECTS_PATH)) {
      return JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf-8')) as string[];
    }
  } catch {
    // corrupt file
  }
  return [];
}

export function saveProjects(projects: string[]): void {
  atomicWriteJSON(PROJECTS_PATH, projects);
}

export function addProject(name: string): void {
  const projects = loadProjects();
  if (!projects.includes(name)) {
    projects.push(name);
    projects.sort();
    saveProjects(projects);
  }
}

export function renameProject(oldName: string, newName: string): void {
  // Update all tasks with this project
  const tasks = loadTasks();
  let changed = false;
  for (const t of tasks) {
    if (t.project === oldName) {
      t.project = newName;
      changed = true;
    }
  }
  if (changed) saveTasks(tasks);

  // Update explicit projects list
  const projects = loadProjects();
  const idx = projects.indexOf(oldName);
  if (idx >= 0) {
    projects[idx] = newName;
    projects.sort();
    saveProjects(projects);
  } else if (!projects.includes(newName)) {
    // Old name was only task-derived, add new name explicitly
    projects.push(newName);
    projects.sort();
    saveProjects(projects);
  }
}

export function removeProjectTag(project: string): void {
  const tasks = loadTasks();
  let changed = false;
  for (const t of tasks) {
    if (t.project === project) {
      t.project = undefined;
      changed = true;
    }
  }
  if (changed) saveTasks(tasks);

  // Remove from explicit projects
  const projects = loadProjects().filter(p => p !== project);
  saveProjects(projects);
}

export function deleteProjectTasks(project: string): void {
  const tasks = loadTasks().filter(t => t.project !== project);
  saveTasks(tasks);

  // Remove from explicit projects
  const projects = loadProjects().filter(p => p !== project);
  saveProjects(projects);
}
