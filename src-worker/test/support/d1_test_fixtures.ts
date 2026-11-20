import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ObservationSchema, type Observation } from "vrc-packages-network/node";
import { Coordinator } from "../../src/storage/d1/coordinator.ts";
import type { Env } from "../../src/worker_entry.ts";

export type InitializedD1Coordinator = Coordinator & { sqlite: Database; close: () => void };

export function createMockD1Database(db = new Database(":memory:")): Env["VRCP_D1"] {
  db.run("PRAGMA foreign_keys = ON;");
  const executions = new WeakMap<D1PreparedStatement, () => D1Result<never>>();
  const meta = (changes = 0, lastRowId = 0): D1Result<never>["meta"] => ({
    changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0
  });
  return {
    prepare(query: string): D1PreparedStatement {
      let boundValues: SQLQueryBindings[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]): D1PreparedStatement {
          boundValues = values.map((v) => (v === undefined ? null : v)) as SQLQueryBindings[];
          return stmt;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const compiled = db.prepare(query);
          try {
            const row = compiled.get(...boundValues) as Record<string, unknown> | null;
            if (!row) return null;
            if (colName) return (row[colName] as T) ?? null;
            return row as T;
          } finally {
            compiled.finalize();
          }
        },
        async run<T = unknown>(): Promise<D1Result<T>> {
          const compiled = db.prepare(query);
          try {
            const info = compiled.run(...boundValues);
            return { success: true, results: [], meta: meta(info.changes, Number(info.lastInsertRowid)) };
          } finally {
            compiled.finalize();
          }
        },
        async all<T = unknown>(): Promise<D1Result<T>> {
          const compiled = db.prepare(query);
          try {
            const results = compiled.all(...boundValues) as T[];
            return { success: true, results, meta: meta() };
          } finally {
            compiled.finalize();
          }
        },
        async raw(): Promise<never> {
          throw new Error("SQLite D1 fixture does not implement raw; use native workerd");
        }
      };
      executions.set(stmt, () => {
        const compiled = db.prepare(query);
        try {
          const info = compiled.run(...boundValues);
          return { success: true, results: [], meta: meta(info.changes, Number(info.lastInsertRowid)) };
        } finally {
          compiled.finalize();
        }
      });
      return stmt;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      db.transaction(() => {
        for (const statement of statements) {
          const execute = executions.get(statement);
          if (!execute) throw new Error("SQLite D1 fixture cannot batch a foreign statement");
          results.push(execute());
        }
      })();
      return results;
    },
    async exec(query: string): Promise<D1ExecResult> {
      const commands = query
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      db.transaction(() => {
        for (const command of commands) {
          const compiled = db.prepare(command);
          try {
            compiled.run();
          } finally {
            compiled.finalize();
          }
        }
      })();
      return { count: commands.length, duration: 0 };
    },
    withSession(): never {
      throw new Error("SQLite D1 fixture does not implement sessions; use native workerd");
    },
    async dump(): Promise<never> {
      throw new Error("SQLite D1 fixture does not implement dump; use native workerd");
    }
  } satisfies Env["VRCP_D1"];
}

export async function createInitializedD1Coordinator(
  databasePath: string = ":memory:",
  now: () => number = Date.now,
  autoSeed: boolean = false
): Promise<InitializedD1Coordinator> {
  if (databasePath !== ":memory:" && databasePath !== "") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }
  const sqlite = new Database(databasePath, { create: true });
  sqlite.run("PRAGMA busy_timeout = 10000;");
  if (databasePath !== ":memory:" && databasePath !== "") {
    sqlite.run("PRAGMA journal_mode = WAL;");
  }
  sqlite.run("PRAGMA foreign_keys = ON;");
  const coordinator = new Coordinator(createMockD1Database(sqlite), now) as InitializedD1Coordinator;
  await coordinator.initSchema(autoSeed);
  coordinator.sqlite = sqlite;
  coordinator.close = () => {
    try {
      sqlite.close(true);
    } catch {
      // ignore
    }
  };
  return coordinator;
}

export function suppressTestUrl(
  store: InitializedD1Coordinator,
  url: string,
  reason: string,
  now: () => number = Date.now
): void {
  const normalized = new URL(url).href;
  if (!reason.trim()) throw new Error("Suppression reason required");
  const timestamp = new Date(now()).toISOString();
  store.sqlite.transaction(() => {
    store.sqlite
      .prepare("INSERT OR REPLACE INTO suppressed_urls(url,reason,suppressed_at) VALUES (?,?,?)")
      .run(normalized, reason, timestamp);
    const job = store.sqlite
      .prepare("SELECT job_id,origin FROM crawl_jobs WHERE url=?")
      .get(normalized) as { job_id: string; origin: string } | null;
    if (!job) return;
    store.sqlite
      .prepare("UPDATE crawl_jobs SET state='blocked',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?")
      .run(job.job_id);
    store.sqlite
      .prepare("UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL WHERE origin=? AND active_job_id=?")
      .run(job.origin, job.job_id);
    store.sqlite
      .prepare("INSERT INTO source_events(job_id,source_key,kind,observed_at,version_id) VALUES (?,NULL,'suppressed',?,NULL)")
      .run(job.job_id, timestamp);
  })();
}

export function listCompleteVpmEvidence(
  store: InitializedD1Coordinator,
  limit = 100
): {
  sourceKey: string;
  sourceUrl: string;
  sourceVersionNo: number;
  observedAt: string;
  contributorNodeId: string | null;
  submissionLeaseId: string | null;
  observation: Observation;
}[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Evidence limit must be 1..100");
  const rows = store.sqlite
    .prepare(
      `SELECT i.source_key,i.source_url,v.version_no,v.observed_at,
        v.contributor_node_id,v.submission_lease_id,v.payload_json
      FROM source_items i JOIN source_versions v ON v.source_key=i.source_key
        AND v.version_no=(SELECT MAX(v2.version_no) FROM source_versions v2
          WHERE v2.source_key=i.source_key AND v2.complete=1)
      LEFT JOIN suppressed_urls s ON s.url=i.source_url
      WHERE i.platform='vpm' AND i.gone_at IS NULL AND s.url IS NULL
      ORDER BY i.source_key LIMIT ?`
    )
    .all(limit) as {
    source_key: string;
    source_url: string;
    version_no: number;
    observed_at: string;
    contributor_node_id: string | null;
    submission_lease_id: string | null;
    payload_json: string;
  }[];
  return rows.map((row) => ({
    sourceKey: row.source_key,
    sourceUrl: row.source_url,
    sourceVersionNo: row.version_no,
    observedAt: row.observed_at,
    contributorNodeId: row.contributor_node_id,
    submissionLeaseId: row.submission_lease_id,
    observation: ObservationSchema.parse(JSON.parse(row.payload_json))
  }));
}

export function inspectNodeEvidence(store: InitializedD1Coordinator, nodeId: string, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Evidence limit must be 1..100");
  if (!store.sqlite.prepare("SELECT 1 FROM node_credentials WHERE node_id=?").get(nodeId)) {
    throw new Error("Node not found");
  }
  const count = (table: string, column: string) =>
    (store.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`).get(nodeId) as { n: number }).n;
  return {
    nodeId,
    totals: {
      submissions: count("job_results", "node_id"),
      versions: count("source_versions", "contributor_node_id"),
      events: count("source_events", "contributor_node_id"),
      issues: count("source_issues", "contributor_node_id"),
      leadsFirstSeen: count("source_leads", "first_seen_node_id"),
      leadsLastSeen: count("source_leads", "last_seen_node_id")
    },
    versions: store.sqlite
      .prepare(
        `SELECT version_id,source_key,version_no,observed_at,complete,submission_lease_id
        FROM source_versions WHERE contributor_node_id=? ORDER BY observed_at DESC,version_id DESC LIMIT ?`
      )
      .all(nodeId, limit),
    events: store.sqlite
      .prepare(
        `SELECT event_id,job_id,source_key,kind,observed_at,version_id,submission_lease_id
        FROM source_events WHERE contributor_node_id=? ORDER BY event_id DESC LIMIT ?`
      )
      .all(nodeId, limit),
    issues: store.sqlite
      .prepare(
        `SELECT issue_id,job_id,source_item_key,version_key,code,observed_at,submission_lease_id
        FROM source_issues WHERE contributor_node_id=? ORDER BY issue_id DESC LIMIT ?`
      )
      .all(nodeId, limit),
    leadsFirstSeen: store.sqlite
      .prepare(
        `SELECT lead_key,kind,target_url,status,first_seen_at,first_seen_lease_id
        FROM source_leads WHERE first_seen_node_id=? ORDER BY first_seen_at DESC,lead_key DESC LIMIT ?`
      )
      .all(nodeId, limit),
    leadsLastSeen: store.sqlite
      .prepare(
        `SELECT lead_key,kind,target_url,status,last_seen_at,last_seen_lease_id
        FROM source_leads WHERE last_seen_node_id=? ORDER BY last_seen_at DESC,lead_key DESC LIMIT ?`
      )
      .all(nodeId, limit)
  };
}
