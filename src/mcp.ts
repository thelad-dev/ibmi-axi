import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AxiError } from "axi-sdk-js";
import type { IbmiConfig, McpConfig } from "./config.js";
import { redact } from "./redact.js";

let cachedClient: Client | null = null;
let cachedConfigKey: string | null = null;

async function getMcpClient(config: IbmiConfig): Promise<Client> {
  if (!config.mcp) {
    throw new AxiError("MCP transport selected but no McpConfig", "CONFIG_ERROR");
  }
  const m = config.mcp;
  const key = `${m.host}:${m.port}:${m.serverCmd.join(" ")}`;
  if (cachedClient && cachedConfigKey === key) return cachedClient;

  // Close previous if different
  if (cachedClient) {
    try { await cachedClient.close(); } catch { /* ignore */ }
    cachedClient = null;
  }

  const transport = new StdioClientTransport({
    command: m.serverCmd[0]!,
    args: m.serverCmd.slice(1),
    env: {
      ...process.env,
      DB2i_HOST: m.host,
      DB2i_PORT: String(m.port),
      ...(m.user ? { DB2i_USER: m.user } : {}),
      ...(m.pass ? { DB2i_PASS: m.pass } : {}),
    },
    stderr: "pipe",
  });

  const client = new Client(
    { name: "ibmi-axi", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  cachedClient = client;
  cachedConfigKey = key;
  return client;
}

/** Run SQL via MCP server (assumes a "execute_sql" or "run_sql" tool; falls back to list_tools discovery if needed). */
export async function runDb2Mcp(config: IbmiConfig, sql: string): Promise<string> {
  const client = await getMcpClient(config);
  // Try common tool names for SQL execution in ibmi-mcp-server / Mapepire MCP
  const candidateTools = ["execute_sql", "run_sql", "db2_query", "query", "sql"];
  let toolName: string | null = null;
  let toolsResult;
  try {
    toolsResult = await client.listTools();
    const available = toolsResult.tools.map((t) => t.name);
    for (const cand of candidateTools) {
      if (available.includes(cand)) {
        toolName = cand;
        break;
      }
    }
    if (!toolName && available.length > 0) {
      // pick first that looks sql-ish or generic
      toolName = available.find((n) => /sql|query|db2|execute/i.test(n)) ?? available[0]!;
    }
  } catch (e) {
    throw new AxiError(`MCP list_tools failed: ${e instanceof Error ? e.message : e}`, "MCP_ERROR");
  }

  if (!toolName) {
    throw new AxiError("no SQL-capable tool found via MCP list_tools", "MCP_ERROR", [
      "Ensure ibmi-mcp-server exposes execute_sql / run_sql tool",
    ]);
  }

  try {
    const callRes = await client.callTool({
      name: toolName,
      arguments: { sql, query: sql, statement: sql }, // try common arg names
    });
    // Extract text content; ibmi-mcp returns tabular or JSON
    const content = (callRes.content ?? []) as Array<{ type: string; text?: string }>;
    const textParts = content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    const out = textParts || JSON.stringify(callRes.content ?? callRes);
    return redact(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AxiError(`MCP callTool ${toolName} failed: ${redact(msg)}`, "MCP_SQL_ERROR", [
      "Check DB2i_* envs / connectivity to Mapepire 8076",
      "Verify SQL syntax and authority",
    ]);
  }
}

/** Close cached MCP client (for tests/cleanup). */
export async function closeMcpClient(): Promise<void> {
  if (cachedClient) {
    try { await cachedClient.close(); } catch { /* ignore */ }
    cachedClient = null;
    cachedConfigKey = null;
  }
}
