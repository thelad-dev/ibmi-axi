import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
  const key = m.mode === "http" && m.url
    ? `http:${m.url}`
    : `${m.host}:${m.port}:${m.serverCmd.join(" ")}`;
  if (cachedClient && cachedConfigKey === key) return cachedClient;

  if (cachedClient) {
    try { await cachedClient.close(); } catch { /* ignore */ }
    cachedClient = null;
  }

  let transport: any;
  if (m.mode === "http" && m.url) {
    transport = new StreamableHTTPClientTransport(new URL(m.url), {
      requestInit: {
        headers: {
          Accept: "application/json, text/event-stream",
        },
      },
    });
  } else {
    transport = new StdioClientTransport({
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
  }

  const client = new Client(
    { name: "ibmi-axi", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  cachedClient = client;
  cachedConfigKey = key;
  return client;
}

/** Run SQL via MCP (prefer execute_sql; http or stdio). */
export async function runDb2Mcp(config: IbmiConfig, sql: string): Promise<string> {
  const client = await getMcpClient(config);
  let toolName = "execute_sql";
  try {
    const toolsResult = await client.listTools();
    const available = toolsResult.tools.map((t) => t.name);
    if (!available.includes("execute_sql")) {
      toolName = available.find((n) => /sql|query|db2|execute/i.test(n)) ?? available[0] ?? "execute_sql";
    }
  } catch (e) {
    // proceed with preferred name
  }

  try {
    const callRes = await client.callTool({
      name: toolName,
      arguments: { sql, query: sql, statement: sql },
    });
    const content = (callRes.content ?? []) as Array<{ type: string; text?: string }>;
    const textParts = content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    const out = textParts || JSON.stringify(callRes.content ?? callRes);
    return redact(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AxiError(`MCP ${toolName} failed: ${redact(msg)}`, "MCP_SQL_ERROR", [
      "Check DB2i_* / IBMI_AXI_MCP_URL / Mapepire connectivity",
      "Verify SQL and authority",
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
