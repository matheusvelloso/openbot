/**
 * What the agents of this computer do with Computer Use now, for the Screen pane of a chat. The
 * backend sees each Computer Use tool call of a turn, with its agent; main sees the window that the
 * driver works in, without its agent. Both stay on this computer: no Team API route or event
 * carries them.
 */

import { isBoundedString, isIdentifier } from "./ipc-bounded-values";
import { isBoolean, isDynamicRecord, isNumber, isOneOf } from "./runtime-values";

/** The kind of a Computer Use step, from the name of the driver tool. */
export const COMPUTER_USE_ACTIONS = ["click", "type", "key", "scroll", "move", "open", "look", "other"] as const;
export type ComputerUseAction = (typeof COMPUTER_USE_ACTIONS)[number];

/** The steps that a session keeps, newest last. */
export const COMPUTER_USE_STEP_LIMIT = 30;
/** The longest side of a preview picture, in pixels. */
export const COMPUTER_USE_PREVIEW_SIZE = 1280;
const TIMESTAMP_LIMIT = 64;
const TITLE_LIMIT = 300;
/** A JPEG data URL of `COMPUTER_USE_PREVIEW_SIZE` pixels is far below this. */
const PREVIEW_DATA_URL_LIMIT = 8 * 1024 * 1024;

export interface ComputerUseStep {
  action: ComputerUseAction;
  startedAt: string;
  /** True once the driver answered. */
  done: boolean;
  failed: boolean;
}

/**
 * One turn of one agent that used Computer Use. `acting` while a driver call runs; `deciding`
 * between two calls, while the model chooses the next step. It ends with the turn.
 */
export interface ComputerUseActivity {
  agentId: string;
  threadId: string;
  turnId: string;
  phase: "acting" | "deciding";
  startedAt: string;
  steps: ComputerUseStep[];
}

export interface ComputerUseActivityState {
  sessions: ComputerUseActivity[];
}

/**
 * A picture of the window that the driver works in now. The driver does not say which agent
 * drives it, so the Screen pane shows it only while its agent has a session.
 */
export interface ComputerUsePreview {
  dataUrl: string;
  width: number;
  height: number;
  /** The window title, or the app name when the window has none. Shown on this computer only. */
  title: string;
  capturedAt: string;
}

function isTimestamp(value: unknown): value is string {
  return isBoundedString(value, TIMESTAMP_LIMIT) && !Number.isNaN(Date.parse(value));
}

function decodeStep(value: unknown): ComputerUseStep {
  if (
    !isDynamicRecord(value) ||
    !isOneOf(COMPUTER_USE_ACTIONS, value.action) ||
    !isTimestamp(value.startedAt) ||
    !isBoolean(value.done) ||
    !isBoolean(value.failed)
  )
    throw new Error("Invalid Computer Use step.");
  return { action: value.action, startedAt: value.startedAt, done: value.done, failed: value.failed };
}

function decodeActivity(value: unknown): ComputerUseActivity {
  if (
    !isDynamicRecord(value) ||
    !isIdentifier(value.agentId) ||
    !isIdentifier(value.threadId) ||
    !isIdentifier(value.turnId) ||
    !isOneOf(["acting", "deciding"] as const, value.phase) ||
    !isTimestamp(value.startedAt) ||
    !Array.isArray(value.steps) ||
    value.steps.length > COMPUTER_USE_STEP_LIMIT
  )
    throw new Error("Invalid Computer Use activity.");
  return {
    agentId: value.agentId,
    threadId: value.threadId,
    turnId: value.turnId,
    phase: value.phase,
    startedAt: value.startedAt,
    steps: value.steps.map(decodeStep),
  };
}

export function decodeComputerUseActivityState(value: unknown): ComputerUseActivityState {
  if (!isDynamicRecord(value) || !Array.isArray(value.sessions) || value.sessions.length > 100)
    throw new Error("Invalid Computer Use activity.");
  return { sessions: value.sessions.map(decodeActivity) };
}

export function decodeComputerUsePreview(value: unknown): ComputerUsePreview | null {
  if (value === null) return null;
  if (
    !isDynamicRecord(value) ||
    !isBoundedString(value.dataUrl, PREVIEW_DATA_URL_LIMIT) ||
    !value.dataUrl.startsWith("data:image/jpeg;base64,") ||
    !isNumber(value.width) ||
    !isNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > COMPUTER_USE_PREVIEW_SIZE ||
    value.height > COMPUTER_USE_PREVIEW_SIZE ||
    !isBoundedString(value.title, TITLE_LIMIT) ||
    !isTimestamp(value.capturedAt)
  )
    throw new Error("Invalid Computer Use preview.");
  return {
    dataUrl: value.dataUrl,
    width: value.width,
    height: value.height,
    title: value.title,
    capturedAt: value.capturedAt,
  };
}

/** The action of a driver tool, by its name. The driver adds tools, so an unknown name is `other`. */
export function computerUseAction(tool: string): ComputerUseAction {
  const name = tool.toLowerCase();
  if (/click|drag|tap/u.test(name)) return "click";
  if (/type|set_value|text|paste/u.test(name)) return "type";
  if (/key|press/u.test(name)) return "key";
  if (/scroll/u.test(name)) return "scroll";
  if (/move|cursor/u.test(name)) return "move";
  if (/launch|open|activate|focus/u.test(name)) return "open";
  if (/screenshot|state|list|get_|zoom|find|read/u.test(name)) return "look";
  return "other";
}
