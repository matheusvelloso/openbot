import { AGENT_EXCHANGE_CAPABILITY, AGENT_EXCHANGE_ROUTE } from "@openbot/contracts/team-protocol/agent-exchange-v1";
import { sourceText } from "@openbot/i18n/source";
import type { TeamApiAgents } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAgentLevel, requireListedAgent, stringField } from "./request-helpers";

/**
 * `agent-exchange-v1`: the messages between an agent and one other agent of the host, for the
 * exchange pane of the agent's chat. Each of them is in a chat of the viewed agent already, so `view`
 * on that agent is enough. The ids are in the body, so the router's check of the path does not see
 * them, and this module refuses an agent hidden from the caller, also as the other agent.
 */
export async function routeAgentExchange(
  context: TeamApiRequestContext,
  agents: Pick<TeamApiAgents, "listAgents" | "readAgentExchange">,
  hiddenAgentIds: ReadonlySet<string>,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, json } = context;
  if (method !== "POST" || url.pathname !== AGENT_EXCHANGE_ROUTE) return "unmatched";
  if (!capabilities.has(AGENT_EXCHANGE_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.agentExchangeUnsupported"));
  // `readJson` has already run the body through the agent-exchange wire codec.
  const body = await readJson(request);
  const agentId = stringField(body, "agentId");
  const peerAgentId = stringField(body, "peerAgentId");
  if (hiddenAgentIds.has(agentId) || hiddenAgentIds.has(peerAgentId) || agentId === peerAgentId)
    throw new HttpError(404, sourceText("error.team.agentNotFound"));
  requireListedAgent(agents, agentId);
  requireListedAgent(agents, peerAgentId);
  requireAgentLevel(context, agentId, "view");
  return json(200, agents.readAgentExchange({ agentId, peerAgentId }));
}
