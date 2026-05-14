import { trace } from "@opentelemetry/api";

export type LogAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Construit une ligne de log structurée (JSON) avec corrélation trace/span si un span actif existe.
 */
function logPayload(
  component: string,
  severity: string,
  message: string,
  attributes?: LogAttributes,
): Record<string, unknown> {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  const payload: Record<string, unknown> = {
    "@timestamp": new Date().toISOString(),
    severityText: severity,
    "logger.name": component,
    body: message,
  };
  if (ctx?.traceId) {
    payload["trace_id"] = ctx.traceId;
    payload["span_id"] = ctx.spanId;
  }
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }
  }
  return payload;
}

/**
 * Retourne un logger applicatif (stdout JSON) aligné sur les conventions OpenTelemetry.
 */
export function getLogger(component: string) {
  return {
    debug(message: string, attributes?: LogAttributes) {
      if (process.env.NODE_ENV === "production") {
        return;
      }
      console.debug(JSON.stringify(logPayload(component, "DEBUG", message, attributes)));
    },
    info(message: string, attributes?: LogAttributes) {
      console.info(JSON.stringify(logPayload(component, "INFO", message, attributes)));
    },
    warn(message: string, attributes?: LogAttributes) {
      console.warn(JSON.stringify(logPayload(component, "WARN", message, attributes)));
    },
    error(message: string, attributes?: LogAttributes, err?: Error) {
      const payload = logPayload(component, "ERROR", message, attributes);
      if (err) {
        payload["exception.type"] = err.name;
        payload["exception.message"] = err.message;
      }
      console.error(JSON.stringify(payload));
    },
  };
}
