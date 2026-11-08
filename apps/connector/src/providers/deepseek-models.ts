/** API models for the DeepSeek HTTP provider. Not part of the npm RELEASES pin. */
export const DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-flash";
export const DEEPSEEK_API_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_PROVIDER_VERSION = "api";

export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];

export function resolveDeepSeekModel(requested?: string | null): DeepSeekModel {
  if (requested && (DEEPSEEK_MODELS as readonly string[]).includes(requested)) {
    return requested as DeepSeekModel;
  }
  return DEEPSEEK_DEFAULT_MODEL;
}

export function deepseekApiKey(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = environment.DEEPSEEK_API_KEY?.trim();
  return value && value.length > 0 ? value : undefined;
}
