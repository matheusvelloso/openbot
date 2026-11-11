import {
  COMPUTER_USE_STEP_LIMIT,
  type ComputerUseActivity,
  type ComputerUseActivityState,
  computerUseAction,
} from "@openbot/contracts/ipc";

export interface ComputerUseStepEvent {
  agentId: string;
  /** The public thread id, the one that a client knows. */
  threadId: string;
  turnId: string;
  /** The provider item of the driver call, so its end finds its step. */
  itemId: string;
  tool: string;
  completed: boolean;
  failed: boolean;
}

interface StoredSession extends ComputerUseActivity {
  /** The provider items whose driver call has not answered yet. */
  openItems: Map<string, number>;
}

/**
 * Which agent turns use Computer Use now, and their steps: one session per thread and turn. The
 * provider calls the driver itself, so this only records the tool items that the turn reports; it
 * never holds or refuses a call. A session is `acting` while a call runs and `deciding` between
 * calls, and it ends with its turn. It holds no window title, typed text or picture.
 */
export class ComputerUseActivitySessions {
  readonly #sessions = new Map<string, StoredSession>();
  readonly #listeners = new Set<(state: ComputerUseActivityState) => void>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  onChanged(listener: (state: ComputerUseActivityState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  state(): ComputerUseActivityState {
    return {
      sessions: [...this.#sessions.values()]
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
        .map(({ openItems: _openItems, ...session }) => ({
          ...session,
          steps: session.steps.map((step) => ({ ...step })),
        })),
    };
  }

  step(event: ComputerUseStepEvent): void {
    const id = `${event.threadId}:${event.turnId}`;
    let session = this.#sessions.get(id);
    if (!session) {
      // A late answer of a call from a turn that already ended starts nothing.
      if (event.completed) return;
      session = {
        agentId: event.agentId,
        threadId: event.threadId,
        turnId: event.turnId,
        phase: "acting",
        startedAt: this.#now().toISOString(),
        steps: [],
        openItems: new Map(),
      };
      this.#sessions.set(id, session);
    }
    if (event.completed) {
      const index = session.openItems.get(event.itemId);
      session.openItems.delete(event.itemId);
      const step = index === undefined ? undefined : session.steps[index];
      if (step) {
        step.done = true;
        step.failed = event.failed;
      }
    } else if (!session.openItems.has(event.itemId)) {
      session.steps.push({
        action: computerUseAction(event.tool),
        startedAt: this.#now().toISOString(),
        done: false,
        failed: false,
      });
      if (session.steps.length > COMPUTER_USE_STEP_LIMIT) {
        const removed = session.steps.length - COMPUTER_USE_STEP_LIMIT;
        session.steps.splice(0, removed);
        for (const [itemId, index] of session.openItems) session.openItems.set(itemId, index - removed);
      }
      session.openItems.set(event.itemId, session.steps.length - 1);
    }
    session.phase = session.openItems.size > 0 ? "acting" : "deciding";
    this.#emitChanged();
  }

  /** The turn ended: completed, failed, stopped or left to the next process. */
  end(threadId: string, turnId: string): void {
    if (this.#sessions.delete(`${threadId}:${turnId}`)) this.#emitChanged();
  }

  clear(): void {
    if (this.#sessions.size === 0) return;
    this.#sessions.clear();
    this.#emitChanged();
  }

  #emitChanged(): void {
    const state = this.state();
    for (const listener of this.#listeners) listener(state);
  }
}
