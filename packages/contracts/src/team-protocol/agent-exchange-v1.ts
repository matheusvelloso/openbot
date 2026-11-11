// Frozen optional agent-exchange-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: a member who can view an
// agent can read the messages between that agent and one other agent of the host: each message that
// one of the two sent to the other, at most the newest 100, oldest first. Every such message is
// already in a chat of the viewed agent, its own chat or a side thread. A message to several agents
// shows once, with the delivery to the other agent of the pair. The text of a message is at most
// 20,000 characters; `textTruncated` tells that the chat holds more. `senderRowId` and
// `recipientRowId` are the ids of the message in the own chats of the two agents, or null when that
// chat does not show it. A message that the member deleted from the viewed agent's own chat is left
// out. The route is a POST with its ids in the body. A hidden agent, or an agent that the peer cannot
// see, is not found (404). A host with this capability also shows in an agent's own chat the messages
// that the agent sent from a side thread. Bounds and meaning do not follow IPC changes; widening any
// of it needs a second capability string.
import {
  adminRoute,
  boolean,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  oneOf,
  string,
} from "./admin-wire";

export const AGENT_EXCHANGE_CAPABILITY = "agent-exchange-v1";

export const AGENT_EXCHANGE_ROUTE = "/v1/agent-exchange";

const deliveryStatus = oneOf("queued", "starting", "running", "completed", "failed", "interrupted", "cancelled");

const exchangeMessage = fields({
  messageId: identifier,
  senderAgentId: identifier,
  recipientAgentId: identifier,
  text: string(20_000),
  textTruncated: boolean,
  createdAt: string(64),
  replyToMessageId: nullable(identifier),
  expectsReply: boolean,
  status: deliveryStatus,
  senderRowId: nullable(string(160)),
  recipientRowId: nullable(string(160)),
});

export const AGENT_EXCHANGE_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [
    AGENT_EXCHANGE_ROUTE,
    adminRoute(
      fields({ agentId: identifier, peerAgentId: identifier }),
      fields({
        agentId: identifier,
        peerAgentId: identifier,
        messages: list(exchangeMessage, 100),
        truncated: boolean,
      }),
    ),
  ],
]);
