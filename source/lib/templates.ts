import type { TimeBlock, DayPlan } from '../types.js';
import { createTimeBlock } from './planner.js';

interface TemplateDefinition {
  name: string;
  description: string;
  blocks: Omit<TimeBlock, 'id'>[];
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    name: 'Build Day',
    description: 'Deep work-focused day for shipping features',
    blocks: [
      { startTime: '09:00', endTime: '11:00', label: 'Deep Work', expectedSessions: 4, priority: 'P1' },
      { startTime: '11:00', endTime: '12:00', label: 'Review', expectedSessions: 2, priority: 'P2' },
      { startTime: '13:00', endTime: '16:00', label: 'Deep Work', expectedSessions: 6, priority: 'P1' },
      { startTime: '16:00', endTime: '17:00', label: 'Admin', expectedSessions: 2, priority: 'P3' },
    ],
  },
  {
    name: 'Admin Monday',
    description: 'Planning, meetings, and housekeeping tasks',
    blocks: [
      { startTime: '09:00', endTime: '10:00', label: 'Email', expectedSessions: 2, priority: 'P2' },
      { startTime: '10:00', endTime: '12:00', label: 'Meetings', expectedSessions: 4, priority: 'P2' },
      { startTime: '13:00', endTime: '15:00', label: 'Planning', expectedSessions: 4, priority: 'P1' },
      { startTime: '15:00', endTime: '17:00', label: 'Misc', expectedSessions: 4, priority: 'P3' },
    ],
  },
  {
    name: 'Learning Friday',
    description: 'Dedicated learning and side-project exploration',
    blocks: [
      { startTime: '09:00', endTime: '11:00', label: 'Study', expectedSessions: 4, priority: 'P1' },
      { startTime: '11:00', endTime: '12:00', label: 'Practice', expectedSessions: 2, priority: 'P1' },
      { startTime: '13:00', endTime: '15:00', label: 'Side Project', expectedSessions: 4, priority: 'P2' },
      { startTime: '15:00', endTime: '17:00', label: 'Review', expectedSessions: 4, priority: 'P3' },
    ],
  },
];

/**
 * Returns the blocks for a named template, with fresh IDs generated.
 * Returns an empty array if the template name is not found.
 */
export function getTemplate(name: string): TimeBlock[] {
  const definition = TEMPLATE_DEFINITIONS.find(t => t.name === name);
  if (!definition) return [];
  return definition.blocks.map(block => createTimeBlock(block));
}

/**
 * Returns a list of all available template names and descriptions.
 */
export function listTemplates(): { name: string; description: string }[] {
  return TEMPLATE_DEFINITIONS.map(t => ({ name: t.name, description: t.description }));
}

/**
 * Creates a DayPlan for the given date using a named template.
 * The template name becomes the plan theme.
 * Returns a plan with an empty blocks array if the template is not found.
 */
export function applyTemplate(templateName: string, date: string): DayPlan {
  return {
    date,
    theme: templateName,
    blocks: getTemplate(templateName),
  };
}
