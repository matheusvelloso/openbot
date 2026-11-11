import {
  agentComputerUseEnabled,
  type ComputerUseActivity,
  type ComputerUseActivityState,
  type ComputerUsePreview,
} from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { conversationPort } from "../conversation-port";
import type { ConversationProps, RightPanelMode } from "../conversation-types";

/** How often the pane asks for a new picture while the agent works. */
const PREVIEW_INTERVAL_MS = 1_000;

export interface ScreenStoreDeps {
  props: ConversationProps;
  activeRightPanel: () => RightPanelMode;
  setActiveRightPanel: (mode: RightPanelMode) => void;
}

/**
 * The Screen pane of a chat: the agent's Computer Use work on this computer and a picture of the
 * window that the driver works in.
 *
 * Local only. The picture is a window of this computer: an agent of a joined server works on that
 * server's display, which this computer cannot capture, and the web client has no window of its own.
 * A server needs a host route that captures its agent display before the pane can show there.
 */
export function createScreenStore(deps: ScreenStoreDeps) {
  const desktop = untrack(() => !deps.props.runtime);
  const screenSupported = createMemo(() => {
    const agent = deps.props.agent;
    return (
      desktop &&
      !deps.props.channel &&
      deps.props.server?.kind !== "remote" &&
      agent !== undefined &&
      agentComputerUseEnabled(agent)
    );
  });
  const [activity, setActivity] = createSignal<ComputerUseActivityState>({ sessions: [] });
  if (desktop) {
    const computerUse = conversationPort().computerUse;
    void computerUse.activity().then(setActivity, () => undefined);
    onCleanup(computerUse.onActivityChanged((state) => setActivity(state)));
  }
  const agentId = createMemo(() => deps.props.agent?.id ?? null);
  /** The agent's newest session: its own chat and a routine thread can each run one. */
  const screenActivity = createMemo((): ComputerUseActivity | undefined => {
    const id = agentId();
    if (!id || !screenSupported()) return undefined;
    return activity()
      .sessions.filter((session) => session.agentId === id)
      .at(-1);
  });
  const working = createMemo(() => screenActivity() !== undefined);
  /*
   * The driver's target is the last window it touched, which at the start of a turn can be a window
   * of the turn before or of another app. After the turn's first answered step it is the window that
   * this turn works in, so the pane asks for a picture only from then on.
   */
  const acted = createMemo(() => screenActivity()?.steps.some((step) => step.done) ?? false);
  /** The last picture, by agent: another agent's chat shows its own, or none. */
  const [pictures, setPictures] = createSignal<{ agentId: string; preview: ComputerUsePreview } | null>(null);
  /** A picture from before the running turn is of another window, so the turn shows none until its own. */
  const screenPreview = () => {
    const picture = pictures();
    if (!picture || picture.agentId !== agentId()) return null;
    const session = screenActivity();
    return session && picture.preview.capturedAt < session.startedAt ? null : picture.preview;
  };
  /** The pane lists in the launcher while it has something to show: work now, or the last picture. */
  const screenAvailable = () => screenSupported() && (working() || screenPreview() !== null);
  const shown = createMemo(() => deps.activeRightPanel() === "screen");

  // A picture about once a second while the pane shows and the agent works in its window.
  createEffect(
    () => (shown() && working() && acted() ? agentId() : null),
    (id) => {
      if (!id) return;
      let stopped = false;
      const capture = () => {
        void conversationPort()
          .computerUse.capturePreview()
          .then(
            (preview) => {
              if (!stopped && preview) setPictures({ agentId: id, preview });
            },
            () => undefined,
          );
      };
      capture();
      const timer = setInterval(capture, PREVIEW_INTERVAL_MS);
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    },
  );

  /*
   * When the agent of the open chat starts to use an app, the pane opens beside the chat, once for
   * each turn: a pane that the user closed stays closed until the next turn uses an app.
   */
  const openedSessions = new Set<string>();
  const newSession = createMemo(() => {
    const session = screenActivity();
    const key = session ? `${session.threadId}:${session.turnId}` : null;
    return key && !openedSessions.has(key) ? key : null;
  });
  createEffect(newSession, (key) => {
    if (!key) return;
    openedSessions.add(key);
    if (untrack(deps.activeRightPanel) === "screen") return;
    untrack(() => deps.setActiveRightPanel("screen"));
  });

  return { screenAvailable, screenActivity, screenPreview };
}
