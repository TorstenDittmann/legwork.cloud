import pino from "pino";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["authorization", "headers.authorization", "*.token", "*.secret", "*.privateKey", "*.payload", "*.content", "*.messages"],
    censor: "[REDACTED]",
  },
});

export const metrics = new Registry();
collectDefaultMetrics({ register: metrics, prefix: "oncall_ai_" });

export const analysisDuration = new Histogram({
  name: "oncall_ai_analysis_duration_seconds", help: "Analysis duration", registers: [metrics],
  labelNames: ["status"] as const, buckets: [1, 5, 15, 30, 60, 120, 300, 600],
});
export const activeSandboxes = new Gauge({ name: "oncall_ai_active_sandboxes", help: "Active sandboxes", registers: [metrics] });
export const destroyedSandboxes = new Counter({ name: "oncall_ai_destroyed_sandboxes_total", help: "Destroyed sandboxes", registers: [metrics], labelNames: ["reason"] as const });
export const purgedRecords = new Counter({ name: "oncall_ai_purged_records_total", help: "Purged retained records", registers: [metrics], labelNames: ["table"] as const });
export const callbackAttempts = new Counter({ name: "oncall_ai_callback_attempts_total", help: "Callback attempts", registers: [metrics], labelNames: ["result"] as const });
