import * as path from 'node:path';
import * as os from 'node:os';
import { nanoid } from 'nanoid';
import type { Task } from '../types.js';
import { atomicWriteJSON, readJSON, atomicWriteJSONAsync } from './fs-utils.js';

import { DATA_DIR } from './paths.js';
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const PROJECTS_PATH = path.join(DATA_DIR, 'projects.json');

export function loadTasks(): Task[] {
  return readJSON<Task[]>(TASKS_PATH, []);
}

export function saveTasks(tasks: Task[]): void {
  atomicWriteJSONAsync(TASKS_PATH, tasks).catch(() => {});
}

export function addTask(text: string, project?: string, description?: string, date?: string, time?: string, endTime?: string): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: nanoid(),
    text,
    completed: false,
    description,
    project,
    date,
    time,
    endTime,
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

export function updateTask(id: string, updates: Partial<Task>): void {
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

export function parseTaskInput(value: string): { text: string; project?: string; unknownProject?: string; date?: string; time?: string; endTime?: string } {
  let text = value.trim();
  let project: string | undefined;
  let unknownProject: string | undefined;
  let date: string | undefined;
  let time: string | undefined;
  let endTime: string | undefined;

  // Parse date:YYYY-MM-DD or date:YYYY/MM/DD or date:YYYY.MM.DD
  const dateMatch = text.match(/date:(\d{4}[-/.]\d{2}[-/.]\d{2})/);
  if (dateMatch) {
    date = dateMatch[1]!.replace(/[./]/g, '-');
    text = text.replace(/date:\d{4}[-/.]\d{2}[-/.]\d{2}/, '').trim();
  }

  // Parse time:<val> (more flexible to support 12h/24h/compact)
  // We look for time: followed by non-space chars
  const timeMatch = text.match(/time:(\S+)/);
  if (timeMatch) {
    time = timeMatch[1];
    text = text.replace(/time:\S+/, '').trim();
  }

  // Parse end:<val>
  const endMatch = text.match(/end:(\S+)/);
  if (endMatch) {
    endTime = endMatch[1];
    text = text.replace(/end:\S+/, '').trim();
  }

  // Extract #project
  // Now allows #project anywhere in the string, but typically at the end
  const projMatch = text.match(/(?:^|\s+)#(\S+)/);
  if (projMatch) {
    const candidate = projMatch[1]!;
    const existing = getProjects();
    text = text.replace(new RegExp(`(?:^|\\s+)#${candidate}`), '').trim();
    if (existing.includes(candidate)) {
      project = candidate;
    } else {
      unknownProject = candidate;
    }
  }

  return { text, project, unknownProject, date, time, endTime };
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export function loadProjects(): string[] {
  return readJSON<string[]>(PROJECTS_PATH, []);
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
