import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import pgpass from "pgpass";

interface Profile {
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
}

const PROFILES_PATH = new URL("./profiles.json", import.meta.url);
const DEFAULT_PROFILE = "staging";
const MAX_ROWS = 500;
const ROOT_CERTIFICATE = join(homedir(), ".postgresql", "root.crt");

function loadProfiles(): Record<string, unknown> {
  try {
    const profiles: unknown = JSON.parse(readFileSync(PROFILES_PATH, "utf8"));
    if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
      throw new Error();
    }
    return profiles as Record<string, unknown>;
  } catch {
    throw new Error(
      "Missing or invalid pgsql/profiles.json; copy profiles.example.json first",
    );
  }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.host === "string" &&
    Number.isInteger(profile.port) &&
    typeof profile.database === "string" &&
    typeof profile.user === "string" &&
    typeof profile.ssl === "boolean"
  );
}

function getProfile(profiles: Record<string, unknown>, name: string): Profile {
  const profile = profiles[name];
  if (!isProfile(profile)) {
    throw new Error(`Unknown or invalid PostgreSQL profile: ${name}`);
  }
  return profile;
}

function passwordFor(connection: object): Promise<string> {
  return new Promise((resolve, reject) => {
    pgpass(connection, (password?: string) => {
      if (password !== undefined) return resolve(password);
      reject(new Error("No matching credential found in ~/.pgpass"));
    });
  });
}

export function formatQueryResult(result: {
  rows: unknown[];
  rowCount: number | null;
  command: string;
}): string {
  const rows = result.rows.slice(0, MAX_ROWS);
  const total = result.rowCount ?? rows.length;
  let text =
    rows.length > 0
      ? JSON.stringify(rows, null, 2)
      : `${result.command}: ${total} row(s)`;

  if (total > rows.length)
    text += `\n\n[Showing ${rows.length} of ${total} rows.]`;

  const truncated = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (truncated.truncated) {
    const size = `${truncated.outputLines} lines / ${formatSize(truncated.outputBytes)}`;
    return `${truncated.content}\n\n[Output truncated to ${size}.]`;
  }
  return text;
}

export default function (pi: ExtensionAPI) {
  const profiles = loadProfiles();

  pi.registerTool({
    name: "pgsql",
    label: "PostgreSQL",
    description: `Run one read-only SQL statement against a configured PostgreSQL profile (${Object.keys(profiles).join(", ")}). Returns at most ${MAX_ROWS} rows and truncates output at ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Run read-only SQL against configured PostgreSQL databases",
    promptGuidelines: [
      "Use pgsql for PostgreSQL queries; never attempt to read or expose ~/.pgpass.",
    ],
    parameters: Type.Object({
      profile: Type.Optional(
        Type.String({
          description: `Connection profile (default: ${DEFAULT_PROFILE})`,
        }),
      ),
      sql: Type.String({ description: "One read-only SQL statement" }),
    }),

    async execute(_toolCallId, params, signal) {
      signal?.throwIfAborted();
      const profileName = params.profile ?? DEFAULT_PROFILE;
      const profile = getProfile(profiles, profileName);
      const ssl = profile.ssl
        ? {
            ca: await readFile(ROOT_CERTIFICATE, "utf8"),
            rejectUnauthorized: true,
          }
        : false;
      const client = new Client({
        ...profile,
        password: passwordFor,
        ssl,
        application_name: "pi-pgsql",
        connectionTimeoutMillis: 5_000,
        statement_timeout: 120_000,
        lock_timeout: 10_000,
        query_timeout: 120_000,
        options: "-c default_transaction_read_only=on",
      });

      try {
        await client.connect();
        await client.query("BEGIN READ ONLY");
        const result = await client.query({
          text: params.sql,
          queryMode: "extended",
        });
        return {
          content: [{ type: "text" as const, text: formatQueryResult(result) }],
          details: {
            profile: profileName,
            command: result.command,
            rowCount: result.rowCount,
            shownRows: Math.min(result.rows.length, MAX_ROWS),
          },
        };
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        await client.end().catch(() => {});
      }
    },
  });
}
