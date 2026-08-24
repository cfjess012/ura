/**
 * The only place the process environment is read (SPEC §26.3).
 *
 * Why it is centralised: on AWS these values arrive from Secrets Manager and
 * Parameter Store rather than a .env file. One module means the migration
 * changes one file, not every call site — and a missing variable fails at
 * the boundary with a clear message instead of surfacing as a driver error
 * three layers down.
 */

export class ConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new ConfigError(
      `${name} is not set. Local: add it to .env. AWS: map it from Secrets Manager or Parameter Store in the task definition.`,
    );
  }
  return value;
}

export const config = {
  /** Postgres connection string. RDS on AWS; Homebrew/compose locally. */
  get databaseUrl(): string {
    return requireEnv("DATABASE_URL");
  },
  /**
   * How the agent is reached (SPEC §6.1). `none` is the default and the
   * honest state: no agent is connected, and the product says so rather
   * than implying one runs. `local` is an agent service over HTTP;
   * `agentcore` is AgentCore Runtime, not yet implemented.
   */
  get agentTransport(): "none" | "local" | "agentcore" {
    const raw = (process.env.AGENT_TRANSPORT ?? "none").trim();
    return raw === "local" || raw === "agentcore" ? raw : "none";
  },
  /** Where the agent service listens, when the transport is `local`. */
  get agentUrl(): string | null {
    const raw = process.env.AGENT_URL?.trim();
    return raw ? raw : null;
  },
  /**
   * Serverless connection ceiling. Lambda scales horizontally and Postgres
   * does not: keep the per-instance pool tiny and put RDS Proxy in front on
   * AWS (recorded in the migration guide, SPEC §26.6).
   */
  get dbPoolMax(): number {
    const raw = process.env.DB_POOL_MAX;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  },
};
