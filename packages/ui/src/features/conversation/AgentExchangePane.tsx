import type { AgentExchange, AgentExchangeMessage, QueueDeliveryStatus } from "@openbot/contracts/ipc";
import type { AppTextKey } from "@openbot/i18n";
import { ArrowLeftRight, ArrowRight, Button, LoaderCircle, TriangleAlert, X } from "@openbot/ui";
import type { AgentProfile } from "@openbot/ui/data";
import { useText } from "@openbot/ui/text";
import { For, Match, Show, Switch } from "solid-js";
import { AgentAvatar } from "../agents/AgentAvatar";
import { formatChatTimestamp } from "./chat-timestamp";
import { MarkdownMessageText } from "./MarkdownMessageText";

export type AgentExchangePaneState =
  | { status: "loading" }
  | { status: "ready"; exchange: AgentExchange }
  | { status: "failed"; error: string };

export interface AgentExchangePaneProps {
  /** The agent of the chat that shows the pane. */
  agentId: string;
  /** The other agent of the pair. */
  peerAgentId: string;
  agents: AgentProfile[];
  state: AgentExchangePaneState;
  /**
   * Opens the own chat of an agent at the row of a message. Absent, a message has no link to its
   * chats.
   */
  onOpenMessage?: ((agentId: string, rowId: string) => void) | undefined;
  onSelectAgent: (agentId: string) => void;
  onOpenLink: (url: string) => void;
  onRetry: () => void;
  onClosePanel: () => void;
}

/** A delivery that did not end as it should names its state. A delivered message names none. */
const DELIVERY_LABELS = {
  queued: "chat.marker.status.queued",
  starting: "chat.marker.status.inProgress",
  running: "chat.marker.status.inProgress",
  completed: undefined,
  failed: "chat.marker.status.failed",
  interrupted: "chat.marker.status.interrupted",
  cancelled: "chat.marker.status.cancelled",
} as const satisfies Record<QueueDeliveryStatus, AppTextKey | undefined>;

/**
 * All messages between two agents, oldest first, in the side panel of a chat: who sent each one,
 * when, its text, and links that open it in the chats of the two agents.
 */
export function AgentExchangePane(props: AgentExchangePaneProps) {
  const { t, format } = useText();
  const agent = (agentId: string) => props.agents.find((candidate) => candidate.id === agentId);
  const name = (agentId: string) => agent(agentId)?.name ?? t("chat.marker.unavailableAgent");
  const title = () => t("chat.exchange.title", { agent: name(props.agentId), peer: name(props.peerAgentId) });
  return (
    <aside class="browser-panel agent-exchange-panel" aria-label={t("conversation.sidePanel.pane.exchange")}>
      <header class="file-preview-header side-panel-pane-header">
        <h2 class="side-panel-pane-title">{t("conversation.sidePanel.pane.exchange")}</h2>
        <Button
          type="button"
          variant="ghost"
          class="browser-toolbar-button side-panel-pane-close"
          aria-label={t("conversation.sidePanel.closePanel")}
          onClick={() => props.onClosePanel()}
        >
          <X class="browser-toolbar-icon" />
        </Button>
      </header>
      <section class="agent-exchange-detail" aria-label={title()}>
        <div class="agent-exchange-pair">
          <span class="agent-exchange-pair-avatars" aria-hidden="true">
            <AgentAvatar agent={agent(props.agentId)} class="agent-exchange-avatar" />
            <ArrowLeftRight class="agent-exchange-pair-icon" />
            <AgentAvatar agent={agent(props.peerAgentId)} class="agent-exchange-avatar" />
          </span>
          <h3 dir="auto">{title()}</h3>
        </div>
        <Switch>
          <Match when={props.state.status === "loading"}>
            <p class="agent-exchange-note" role="status">
              <LoaderCircle class="agent-exchange-note-icon agent-exchange-spin" aria-hidden="true" />
              {t("chat.exchange.loading")}
            </p>
          </Match>
          <Match when={props.state.status === "failed" && props.state}>
            {(failed) => (
              <div class="agent-exchange-failure" role="alert">
                <p class="agent-exchange-note">
                  <TriangleAlert class="agent-exchange-note-icon" aria-hidden="true" />
                  {failed().error}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => props.onRetry()}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
          </Match>
          <Match when={props.state.status === "ready" && props.state.exchange}>
            {(exchange) => (
              <Show
                when={exchange().messages.length > 0}
                fallback={<p class="agent-exchange-note">{t("chat.exchange.empty")}</p>}
              >
                <Show when={exchange().truncated}>
                  <p class="agent-exchange-note">{t("chat.exchange.older", { count: exchange().messages.length })}</p>
                </Show>
                <ol class="agent-exchange-list">
                  <For each={exchange().messages} keyed={(message) => message.messageId}>
                    {(message) => (
                      <ExchangeMessage
                        message={message()}
                        agentId={props.agentId}
                        agents={props.agents}
                        name={name}
                        time={formatChatTimestamp(new Date(message().createdAt), format)}
                        onOpenMessage={props.onOpenMessage}
                        onSelectAgent={props.onSelectAgent}
                        onOpenLink={props.onOpenLink}
                      />
                    )}
                  </For>
                </ol>
              </Show>
            )}
          </Match>
        </Switch>
      </section>
    </aside>
  );
}

function ExchangeMessage(props: {
  message: AgentExchangeMessage;
  agentId: string;
  agents: AgentProfile[];
  name: (agentId: string) => string;
  time: string;
  onOpenMessage?: ((agentId: string, rowId: string) => void) | undefined;
  onSelectAgent: (agentId: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const { t } = useText();
  const sender = () => props.agents.find((agent) => agent.id === props.message.senderAgentId);
  const deliveryLabel = () => DELIVERY_LABELS[props.message.status];
  // The rows of the message in the chats of the two agents, the sender's first.
  const links = () =>
    props.onOpenMessage
      ? [
          { agentId: props.message.senderAgentId, rowId: props.message.senderRowId },
          { agentId: props.message.recipientAgentId, rowId: props.message.recipientRowId },
        ].flatMap((link) => (link.rowId ? [{ agentId: link.agentId, rowId: link.rowId }] : []))
      : [];
  return (
    <li
      class="agent-exchange-message"
      data-direction={props.message.senderAgentId === props.agentId ? "outgoing" : "incoming"}
    >
      <div class="agent-exchange-message-head">
        <AgentAvatar agent={sender()} class="agent-exchange-avatar" />
        <span class="agent-exchange-author" dir="auto">
          {props.name(props.message.senderAgentId)}
        </span>
        <span class="agent-exchange-recipient" dir="auto">
          {t("chat.exchange.to", { name: props.name(props.message.recipientAgentId) })}
        </span>
        <time class="agent-exchange-time" datetime={props.message.createdAt}>
          {props.time}
        </time>
      </div>
      <Show when={deliveryLabel()}>{(label) => <span class="agent-exchange-status">{t(label())}</span>}</Show>
      <div class="agent-exchange-text message-markdown">
        <MarkdownMessageText
          body={props.message.text}
          agents={props.agents}
          linkFavicons={false}
          onSelectAgent={props.onSelectAgent}
          onOpenLink={props.onOpenLink}
        />
      </div>
      <Show when={props.message.textTruncated}>
        <p class="agent-exchange-note">{t("chat.exchange.truncated")}</p>
      </Show>
      <Show when={links().length > 0}>
        <div class="agent-exchange-links">
          <For each={links()} keyed={(link) => link.agentId}>
            {(link) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="agent-exchange-link"
                data-cuelume-tap="navigate"
                onClick={() => props.onOpenMessage?.(link().agentId, link().rowId)}
              >
                <ArrowRight aria-hidden="true" />
                <span>{t("chat.exchange.openIn", { name: props.name(link().agentId) })}</span>
              </Button>
            )}
          </For>
        </div>
      </Show>
    </li>
  );
}
