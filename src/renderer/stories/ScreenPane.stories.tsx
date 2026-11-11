import type { ComputerUseAction, ComputerUseActivityState, ComputerUseStep } from "@openbot/contracts/ipc";
import { onSettled } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { MockOpenBotControls } from "../src/preview/mock-openbot";
import macDesktopMock from "./assets/remote-desktop-mac-mock.png";
import { PrototypeApp } from "./prototype-support";

const meta = {
  title: "Conversation/Screen pane",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The steps that Chief plays, one every `STEP_MS`. After the last one its turn ends and a new turn starts. */
const ACTIONS: ComputerUseAction[] = ["open", "look", "click", "type", "key", "scroll"];
const STEP_MS = 1_200;

/**
 * Chief works in an app of this computer, as main reports it: each step starts (`acting`), answers
 * (`deciding`), and the next one follows. After the last step the turn ends for one step, so the pane
 * shows the idle state, and the next turn starts again.
 */
function playChief(mock: MockOpenBotControls): () => void {
  let turn = 1;
  let tick = 0;
  let steps: ComputerUseStep[] = [];
  const state = (phase: "acting" | "deciding"): ComputerUseActivityState => ({
    sessions: [
      {
        agentId: "chief",
        threadId: "thread-chief",
        turnId: `turn-screen-${turn}`,
        phase,
        startedAt: steps[0]?.startedAt ?? new Date().toISOString(),
        steps,
      },
    ],
  });
  const play = () => {
    const index = Math.floor(tick / 2);
    if (index >= ACTIONS.length) {
      mock.emitComputerUseActivity({ sessions: [] });
      turn += 1;
      tick = 0;
      steps = [];
      return;
    }
    const action = ACTIONS[index] ?? "other";
    if (tick % 2 === 0) {
      steps = [...steps, { action, startedAt: new Date().toISOString(), done: false, failed: false }];
      mock.emitComputerUseActivity(state("acting"));
    } else {
      steps = steps.map((step, position) => (position === steps.length - 1 ? { ...step, done: true } : step));
      mock.emitComputerUseActivity(state("deciding"));
    }
    tick += 1;
  };
  play();
  const timer = setInterval(play, STEP_MS / 2);
  return () => clearInterval(timer);
}

/** The real app on the preview mock, with Chief working in an app of this computer. */
function ScreenPaneStory() {
  let stop: (() => void) | undefined;
  onSettled(() => () => stop?.());
  return (
    <div style={{ height: "100vh" }}>
      <PrototypeApp
        options={{
          computerUsePreview: {
            dataUrl: macDesktopMock,
            width: 1280,
            height: 801,
            title: "dashboard.tsx — workspace",
            capturedAt: new Date().toISOString(),
          },
        }}
        setup={(mock) => {
          stop = playChief(mock);
        }}
      />
    </div>
  );
}

/**
 * Chief uses an app: the Screen pane opens beside the chat with the window, what Chief does now, Stop
 * and the steps of the turn. Between two turns it shows the last picture, dimmed.
 */
export const Working: Story = {
  render: () => <ScreenPaneStory />,
};
