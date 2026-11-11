import type { ComputerUseAction, ComputerUseActivity, ComputerUsePreview } from "@openbot/contracts/ipc";
import type { AppMessages, AppTextKey } from "@openbot/i18n";
import { Badge, Button, Monitor, Square } from "@openbot/ui";
import type { AgentProfile } from "@openbot/ui/data";
import { useText } from "@openbot/ui/text";
import { For, Show } from "solid-js";
import { AgentAvatar } from "../agents/AgentAvatar";

export interface ScreenPaneProps {
  agent: AgentProfile | undefined;
  /** The agent's Computer Use work in the running turn, or undefined while it uses no app. */
  activity: ComputerUseActivity | undefined;
  /** The last picture of the window that the agent works in. It stays, dimmed, after the work ends. */
  preview: ComputerUsePreview | null;
  /** Stops the agent's turn. Absent while no turn runs. */
  onStop?: (() => void) | undefined;
}

const NOW_LABELS = {
  click: "conversation.screen.now.click",
  type: "conversation.screen.now.type",
  key: "conversation.screen.now.key",
  scroll: "conversation.screen.now.scroll",
  move: "conversation.screen.now.move",
  open: "conversation.screen.now.open",
  look: "conversation.screen.now.look",
  other: "conversation.screen.now.other",
} as const satisfies Record<ComputerUseAction, keyof AppMessages>;

const STEP_LABELS = {
  click: "conversation.screen.step.click",
  type: "conversation.screen.step.type",
  key: "conversation.screen.step.key",
  scroll: "conversation.screen.step.scroll",
  move: "conversation.screen.step.move",
  open: "conversation.screen.step.open",
  look: "conversation.screen.step.look",
  other: "conversation.screen.step.other",
} as const satisfies Record<ComputerUseAction, AppTextKey>;

/**
 * The Screen pane of the side panel: a live picture of the window that the agent works in with
 * Computer Use on this computer, what it does now, Stop, and its steps in this turn. The picture
 * comes about once a second while the agent works; the driver works in one window at a time.
 */
export function ScreenPane(props: ScreenPaneProps) {
  const { t, format } = useText();
  const name = () => props.agent?.name ?? t("chat.message.agentFallback");
  const app = () => props.preview?.title || t("conversation.screen.app");
  const live = () => props.activity !== undefined;
  const nowText = () => {
    const activity = props.activity;
    if (!activity) return t("conversation.screen.now.idle", { name: name() });
    const step = activity.steps.at(-1);
    if (activity.phase === "deciding" || !step) return t("conversation.screen.now.deciding", { name: name() });
    return t(NOW_LABELS[step.action], { name: name(), app: app() });
  };
  const steps = () => [...(props.activity?.steps ?? [])].reverse();
  return (
    <aside class="browser-panel screen-pane" aria-label={t("conversation.sidePanel.pane.screen")}>
      <div class="screen-pane-body">
        <div class="screen-pane-toolbar">
          <Badge variant="secondary" class="screen-pane-badge" data-live={live() ? "" : undefined}>
            <span class="screen-pane-dot" aria-hidden="true" />
            {live() ? t("conversation.screen.live") : t("conversation.screen.idle")}
          </Badge>
          <Show when={props.preview}>
            {(preview) => (
              <span class="screen-pane-window" dir="auto" title={preview().title}>
                <Monitor aria-hidden="true" />
                <span>{preview().title || t("conversation.screen.app")}</span>
              </span>
            )}
          </Show>
        </div>
        <p class="screen-pane-now">
          <AgentAvatar agent={props.agent} class="screen-pane-avatar" />
          <span dir="auto">{nowText()}</span>
        </p>
        <Show
          when={props.preview}
          fallback={<p class="screen-pane-empty">{t("conversation.screen.empty", { name: name() })}</p>}
        >
          {(preview) => (
            <div
              class="screen-pane-frame"
              data-live={live() ? "" : undefined}
              style={{ "aspect-ratio": `${preview().width} / ${preview().height}` }}
            >
              <img
                src={preview().dataUrl}
                alt={t("conversation.screen.pictureLabel", { name: name(), app: app() })}
                draggable={false}
              />
            </div>
          )}
        </Show>
        <Show when={props.onStop && live()}>
          <div class="screen-pane-actions">
            <Button type="button" variant="secondary" size="sm" onClick={() => props.onStop?.()}>
              <Square aria-hidden="true" />
              {t("conversation.screen.stop", { name: name() })}
            </Button>
          </div>
        </Show>
        <Show when={steps().length > 0}>
          <h3 class="screen-pane-heading">{t("conversation.screen.steps")}</h3>
          <ol class="screen-pane-steps" aria-label={t("conversation.screen.steps")}>
            <For each={steps()} keyed={false}>
              {(step, index) => (
                <li class="screen-pane-step" data-current={index === 0 && live() ? "" : undefined}>
                  <span class="screen-pane-step-text">{t(STEP_LABELS[step().action])}</span>
                  <Show when={step().failed}>
                    <span class="screen-pane-step-failed">{t("conversation.screen.step.failed")}</span>
                  </Show>
                  <time class="screen-pane-step-time" datetime={step().startedAt}>
                    {format.date(new Date(step().startedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </time>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </div>
    </aside>
  );
}
