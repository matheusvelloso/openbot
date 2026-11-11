import type { AgentExchange, AgentExchangeInput } from "@openbot/contracts/ipc";
import { AGENT_EXCHANGE_CAPABILITY } from "@openbot/contracts/team-protocol/agent-exchange-v1";
import type { AgentExchangePaneState } from "@openbot/ui/features/conversation/AgentExchangePane";
import { currentText } from "@openbot/ui/text";
import { createEffect, createMemo, createSignal } from "solid-js";
import { serverSupportsCapability } from "../../servers/server-capabilities";
import { conversationPort } from "../conversation-port";
import type { ConversationProps } from "../conversation-types";

export interface AgentExchangeStoreDeps {
  props: ConversationProps;
  /** The other agent of the exchange pane of this chat, while it shows or when it showed last. */
  peerAgentId: () => string | null;
  /** True while the side panel shows the exchange pane. */
  shown: () => boolean;
}

interface ExchangeRequest {
  key: string;
  serverId: string | undefined;
  input: AgentExchangeInput;
}

/**
 * The messages between the agent of a chat and another agent, for the exchange pane, and whether the
 * host can answer for them. The pane reads them when it shows, and again when an agent message of
 * the chat arrives or changes its state.
 */
export function createAgentExchangeStore(deps: AgentExchangeStoreDeps) {
  /** A joined server or a web host needs `agent-exchange-v1`. A channel has no agent of its own. */
  const agentExchangeAvailable = createMemo(() => {
    if (deps.props.channel || !deps.props.agent) return false;
    return deps.props.runtime
      ? Boolean(deps.props.runtime.agentExchange)
      : serverSupportsCapability(deps.props.server, AGENT_EXCHANGE_CAPABILITY);
  });
  const [agentExchangeState, setAgentExchangeState] = createSignal<AgentExchangePaneState>({ status: "loading" });
  const [reloads, setReloads] = createSignal(0);
  /** Changes when an agent message of the chat arrives or changes its state. */
  const exchangeRevision = createMemo(() =>
    deps.props.messages
      .flatMap((message) =>
        message.exchange
          ? [`${message.id}:${message.exchange.deliveries.map((delivery) => delivery.status).join(",")}`]
          : [],
      )
      .join("|"),
  );
  const read = (request: ExchangeRequest): Promise<AgentExchange> => {
    const runtime = deps.props.runtime;
    if (runtime) {
      const call = runtime.agentExchange;
      if (!call) return Promise.reject(new Error(currentText().t("chat.exchange.failed")));
      return call(request.input);
    }
    return conversationPort().agent.readAgentExchange(request.input, request.serverId);
  };
  let shownKey: string | null = null;
  let generation = 0;
  createEffect(
    (): (ExchangeRequest & { revision: string; reload: number }) | null => {
      const agentId = deps.props.agent?.id;
      const peerAgentId = deps.peerAgentId();
      if (!agentExchangeAvailable() || !deps.shown() || !agentId || !peerAgentId) return null;
      const serverId = deps.props.server?.id;
      return {
        key: `${serverId ?? "local"}:${agentId}:${peerAgentId}`,
        serverId,
        input: { agentId, peerAgentId },
        revision: exchangeRevision(),
        reload: reloads(),
      };
    },
    (request) => {
      if (!request) {
        shownKey = null;
        return;
      }
      const current = ++generation;
      // Another pair shows its own messages, never the earlier pair's. A refresh keeps the list.
      if (shownKey !== request.key) setAgentExchangeState({ status: "loading" });
      shownKey = request.key;
      void read(request).then(
        (exchange) => {
          if (current === generation) setAgentExchangeState({ status: "ready", exchange });
        },
        (error: unknown) => {
          if (current !== generation) return;
          const { t, errorMessage } = currentText();
          setAgentExchangeState({ status: "failed", error: errorMessage(error, t("chat.exchange.failed")) });
        },
      );
    },
  );
  return {
    agentExchangeAvailable,
    agentExchangeState,
    reloadAgentExchange: () => {
      setAgentExchangeState({ status: "loading" });
      setReloads((count) => count + 1);
    },
  };
}
