import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../../..");

function binary(name: string) {
  const directories = process.env.PG_BINDIR ? [process.env.PG_BINDIR] : (process.env.PATH || "").split(delimiter);
  const candidate = directories.map(directory => join(directory, name)).find(existsSync);
  if (!candidate) throw new Error(`${name} is required for real campaign database tests; install PostgreSQL or set PG_BINDIR`);
  return candidate;
}

export function startCampaignPostgres(beforeCampaign?: (sql: (query: string) => string) => void) {
  const psql = binary("psql");
  const pgCtl = binary("pg_ctl");
  // The worktree / approved long temp path exceeds PostgreSQL's Unix socket limit.
  const directory = mkdtempSync(join(tmpdir(), "cpg-"));
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  let started = false;
  const connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-qAt", "postgres"];
  const run = (command: string, args: string[]) => execFileSync(command, args, { encoding: "utf8", stdio: "pipe" });
  const sql = (query: string) => run(psql, [...connection, "-c", query]).trim();
  const stop = () => {
    if (started) run(pgCtl, ["-D", data, "stop", "-m", "fast"]);
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    run(binary("initdb"), ["-D", data, "--no-locale", "--encoding=UTF8"]);
    mkdirSync(socket);
    run(pgCtl, ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-k ${socket} -c listen_addresses=`, "start"]);
    started = true;
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema extensions; grant usage on schema extensions to service_role;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create schema storage; create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security; create publication supabase_realtime;`);
    const shared = run(binary("pg_config"), ["--sharedir"]).trim();
    for (const file of readdirSync(join(root, "supabase/migrations")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.endsWith("_campaign_links.sql")) beforeCampaign?.(sql);
      let migration = readFileSync(join(root, "supabase/migrations", file), "utf8");
      // Exactly the baseline verifier's optional-vector adaptation; campaign SQL is unchanged.
      if (!existsSync(join(shared, "extension/vector.control"))) {
        migration = migration.replace(/create extension if not exists vector with schema extensions;\n/i, "")
          .replace(/extensions\.vector\(1536\)/g, "text")
          .replace(/create(?: or replace)? function public\.match_products_by_embedding\([\s\S]*?\n\$\$;\n/i, "");
      }
      writeFileSync(join(directory, "migration.sql"), migration);
      run(psql, [...connection, "-f", join(directory, "migration.sql")]);
    }
    return {
      sql, stop, socket,
      async race(winnerSql: string, competingSql: string) {
        const winner = spawn(psql, connection, { stdio: ["pipe", "pipe", "pipe"] });
        let winnerError = "";
        winner.stderr.on("data", chunk => { winnerError += String(chunk); });
        const exited = new Promise(resolve => winner.once("exit", resolve));
        const held = new Promise<void>((resolve, reject) => {
          let output = "";
          winner.stdout.on("data", chunk => { output += String(chunk); if (output.includes("CAMPAIGN_LOCK_HELD")) resolve(); });
          winner.once("error", reject);
          winner.once("exit", code => { if (code !== 0) reject(new Error(winnerError)); });
        });
        winner.stdin.write(`begin; set role service_role; ${winnerSql}\n\\echo CAMPAIGN_LOCK_HELD\n`);
        await held;
        const competitor = promisify(execFile)(psql, [...connection, "-c", `set role service_role; ${competingSql}`], {
          env: { ...process.env, PGAPPNAME: "campaign-race-test" },
        }).then(result => ({ ok: true, output: result.stdout.trim() }), (error: { stderr: string }) => ({ ok: false, output: String(error.stderr) }));
        try {
          // A transaction caches the backend list: refresh to see sessions that
          // connected after the first poll, rather than falsely timing out.
          sql(`do $$ begin for attempt in 1..500 loop
            perform pg_stat_clear_snapshot();
            if exists (select 1 from pg_stat_activity where application_name = 'campaign-race-test' and wait_event_type = 'Lock') then return; end if;
            perform pg_sleep(0.01); end loop; raise exception 'Competitor never waited on a real database lock'; end $$;`);
        } finally {
          winner.stdin.end("commit;\n");
          await exited;
        }
        if (winnerError) throw new Error(winnerError);
        return competitor;
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}
