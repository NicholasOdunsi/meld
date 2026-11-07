import { readFile } from "node:fs/promises";
import {
  classifyProviderFailure,
  providerFailure,
  validateTaskResult,
  type ProviderAdapter,
  type ProviderAdapterRequest,
  type ProviderEvent,
} from "./provider-adapter";
import {
  DEEPSEEK_API_ENDPOINT,
  deepseekApiKey,
  resolveDeepSeekModel,
} from "./deepseek-models";

const PROVIDER = "deepseek" as const;
const DEFAULT_TIMEOUT_MS = 180_000;

export interface DeepSeekAdapterDependencies {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * HTTP adapter for DeepSeek's OpenAI-compatible chat API. Used for local
 * taste-test screen generation when ChatGPT Codex is capped. No managed CLI.
 */
export function createDeepSeekAdapter(
  dependencies: DeepSeekAdapterDependencies = {},
): ProviderAdapter {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    provider: PROVIDER,
    async run(request) {
      if (request.signal?.aborted) {
        return [providerFailure(PROVIDER, "cancelled")];
      }
      if (request.webSearch) {
        return [
          providerFailure(
            PROVIDER,
            "provider_unavailable",
            "web search is not supported",
          ),
        ];
      }

      const apiKey = dependencies.apiKey ?? deepseekApiKey();
      if (!apiKey) {
        return [providerFailure(PROVIDER, "authentication_required")];
      }

      let schemaText: string;
      try {
        schemaText = await readFile(request.workspace.responseSchemaFile, "utf8");
      } catch {
        return [providerFailure(PROVIDER, "provider_unavailable", "missing response schema")];
      }

      const model = resolveDeepSeekModel(request.model);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(DEEPSEEK_API_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `${request.systemPrompt}

Return ONLY JSON that matches this response schema. No markdown fences, no prose.
${schemaText}`,
              },
              { role: "user", content: request.prompt },
            ],
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (request.signal?.aborted || controller.signal.aborted) {
          return [providerFailure(PROVIDER, "cancelled")];
        }
        const text = error instanceof Error ? error.message : "network";
        return [providerFailure(PROVIDER, classifyProviderFailure(text))];
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
      }

      if (!response.ok) {
        let body = "";
        try {
          body = await response.text();
        } catch {
          body = "";
        }
        return [
          providerFailure(
            PROVIDER,
            classifyProviderFailure(`${response.status} ${body}`),
          ),
        ];
      }

      let content: string;
      try {
        const body = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const raw = body.choices?.[0]?.message?.content;
        content = typeof raw === "string" ? raw : "";
      } catch {
        return [providerFailure(PROVIDER, "malformed_output", "response was not JSON")];
      }

      let payload: unknown;
      try {
        payload = JSON.parse(content);
      } catch {
        return [providerFailure(PROVIDER, "malformed_output", "reply had no JSON result")];
      }

      const verdict = validateTaskResult(payload, request.manifest, request.kind);
      if (!verdict.ok) {
        return [providerFailure(PROVIDER, verdict.code, verdict.reason)];
      }
      return [
        { type: "progress", label: "Working" },
        { type: "completed", result: verdict.result },
      ] satisfies ProviderEvent[];
    },
  };
}
