/**
 * OpenTelemetry, from this service's first day (SPEC §6.4 obligation 5).
 *
 * The obligation attaches at the agent service's birth precisely so it is
 * never retrofitted: a span is the record of what a run actually did, and
 * the alternative — reconstructing it from logs afterwards — is how nobody
 * ever knows why a draft was refused.
 *
 * Locally the exporter prints to stdout. On AWS the same API points at
 * CloudWatch through AgentCore Observability; the code does not change,
 * only the exporter.
 */
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export function startTelemetry(): void {
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: "ura-agent",
      [ATTR_SERVICE_VERSION]: process.env.AGENT_VERSION ?? "dev",
    }),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  provider.register();
}
