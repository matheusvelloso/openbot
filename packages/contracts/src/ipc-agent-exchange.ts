/**
 * The messages between two agents of one server (`agent-exchange-v1`), as the desktop main process,
 * the preload and the browser client read them. The exchange pane of a chat lists them: each message
 * that one of the two agents sent to the other, oldest first. A message to several agents shows once,
 * with the delivery to the other agent of the pair.
 */

import { isBoundedString, isIdentifier, isNullableBoundedString } from "./ipc-bounded-values";
import { QUEUE_DELIVERY_STATUSES, type QueueDeliveryStatus } from "./ipc-queue";
import { isBoolean, isDynamicRecord, isOneOf } from "./runtime-values";

/** The newest messages that one read returns. `AgentExchange.truncated` tells that older ones exist. */
export const AGENT_EXCHANGE_MESSAGE_LIMIT = 100;
/** The text of a message that the pane shows. The chat of the message shows all of it. */
export const AGENT_EXCHANGE_TEXT_LIMIT = 20_000;
const TIMESTAMP_LIMIT = 64;

export interface AgentExchangeInput {
  /** The agent of the chat that shows the pane. */
  agentId: string;
  /** The other agent of the pair. */
  peerAgentId: string;
}

export interface AgentExchangeMessage {
  /** The mailbox message, the same id as `AgentExchangeSummary.messageId`. */
  messageId: string;
  senderAgentId: string;
  recipientAgentId: string;
  /** At most `AGENT_EXCHANGE_TEXT_LIMIT` characters. */
  text: string;
  /** True when `text` is the start of a longer text. */
  textTruncated: boolean;
  createdAt: string;
  replyToMessageId: string | null;
  /** False for an update that asks for no answer. */
  expectsReply: boolean;
  /** The delivery to `recipientAgentId`. */
  status: QueueDeliveryStatus;
  /** The row of the message in the sender's own chat, or null when that chat does not show it. */
  senderRowId: string | null;
  /** The row of the message in the recipient's own chat, or null when it ran in a side thread. */
  recipientRowId: string | null;
}

export interface AgentExchange {
  agentId: string;
  peerAgentId: string;
  messages: AgentExchangeMessage[];
  /** True when older messages exist than the ones in `messages`. */
  truncated: boolean;
}

/**
 * The id of the row that shows a message of an agent to other agents in the agent's own chat. A host
 * with `agent-exchange-v1` writes this row also for a message from a side thread.
 */
export function agentOutboxRowId(messageId: string): string {
  return `outbox-${messageId}`;
}

function isTimestamp(value: unknown): value is string {
  return isBoundedString(value, TIMESTAMP_LIMIT) && !Number.isNaN(Date.parse(value));
}

function decodeAgentExchangeMessage(value: unknown): AgentExchangeMessage {
  if (
    !isDynamicRecord(value) ||
    !isIdentifier(value.messageId) ||
    !isIdentifier(value.senderAgentId) ||
    !isIdentifier(value.recipientAgentId) ||
    !isBoundedString(value.text, AGENT_EXCHANGE_TEXT_LIMIT) ||
    !isBoolean(value.textTruncated) ||
    !isTimestamp(value.createdAt) ||
    !(value.replyToMessageId === null || isIdentifier(value.replyToMessageId)) ||
    !isBoolean(value.expectsReply) ||
    !isOneOf(QUEUE_DELIVERY_STATUSES, value.status) ||
    !isNullableBoundedString(value.senderRowId, 160) ||
    !isNullableBoundedString(value.recipientRowId, 160)
  )
    throw new Error("Invalid agent exchange message.");
  return {
    messageId: value.messageId,
    senderAgentId: value.senderAgentId,
    recipientAgentId: value.recipientAgentId,
    text: value.text,
    textTruncated: value.textTruncated,
    createdAt: value.createdAt,
    replyToMessageId: value.replyToMessageId,
    expectsReply: value.expectsReply,
    status: value.status,
    senderRowId: value.senderRowId,
    recipientRowId: value.recipientRowId,
  };
}

export function decodeAgentExchange(value: unknown): AgentExchange {
  if (
    !isDynamicRecord(value) ||
    !isIdentifier(value.agentId) ||
    !isIdentifier(value.peerAgentId) ||
    !Array.isArray(value.messages) ||
    value.messages.length > AGENT_EXCHANGE_MESSAGE_LIMIT ||
    !isBoolean(value.truncated)
  )
    throw new Error("Invalid agent exchange.");
  return {
    agentId: value.agentId,
    peerAgentId: value.peerAgentId,
    messages: value.messages.map(decodeAgentExchangeMessage),
    truncated: value.truncated,
  };
}

export function decodeAgentExchangeInput(value: unknown): AgentExchangeInput {
  if (!isDynamicRecord(value) || !isIdentifier(value.agentId) || !isIdentifier(value.peerAgentId))
    throw new Error("Invalid agent exchange request.");
  return { agentId: value.agentId, peerAgentId: value.peerAgentId };
}
