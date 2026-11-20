const { config } = require("../../config/env");

class AIProviderError extends Error {
  constructor(message, retryable = false, statusCode = null, details = null, category = "general") {
    super(message);
    this.name = "AIProviderError";
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.details = details;
    this.category = category;
  }
}

class OpenAICompatibleProvider {
  constructor({
    name = "openai-compatible",
    baseUrl = config.aiBaseUrl,
    apiKey = config.aiApiKey,
    model = config.aiModel,
  } = {}) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateStructured({ system, prompt, schemaName, timeoutMs = config.aiTimeoutMs }) {
    const effectiveTimeout = Math.max(timeoutMs || config.aiTimeoutMs || 30000, 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);
    const started = Date.now();
    try {
      const headers = {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      };
      if (this.baseUrl.includes("openrouter.ai") || this.name === "openrouter") {
        headers["HTTP-Referer"] = config.clientUrl || "http://localhost:5173";
        headers["X-Title"] = "HireSmart AI";
      }
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${system}\nReturn only valid JSON for schema ${schemaName}.`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        let errJson = null;
        try {
          errJson = JSON.parse(errText);
        } catch {
          errJson = null;
        }
        const errorMsg = errJson?.error?.message || errText || "";
        const isQuotaExhausted =
          response.status === 429 &&
          (/quota|resource_exhausted|free_tier|daily limit|exceeded your current quota/i.test(errorMsg) ||
            errJson?.error?.status === "RESOURCE_EXHAUSTED");
        const category = isQuotaExhausted
          ? "quota_exhausted"
          : response.status === 401
            ? "authentication_error"
            : response.status === 404
              ? "model_not_found"
              : response.status === 429
                ? "rate_limit"
                : response.status >= 500
                  ? "provider_unavailable"
                  : "api_error";
        const retryable =
          !isQuotaExhausted &&
          response.status !== 401 &&
          response.status !== 403 &&
          response.status !== 404 &&
          (response.status === 429 || response.status >= 500);

        throw new AIProviderError(
          isQuotaExhausted
            ? `AI provider quota exhausted (${response.status})`
            : `AI provider returned ${response.status}`,
          retryable,
          response.status,
          errorMsg.slice(0, 300),
          category,
        );
      }
      const rawBody = await response.text();
      if (rawBody.length > 2_000_000)
        throw new AIProviderError("AI provider response exceeded the size limit", false, 413, null, "payload_too_large");
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new AIProviderError("AI provider returned malformed HTTP JSON", false, 502, null, "malformed_response");
      }
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new AIProviderError("AI provider returned an empty response", false, 502, null, "empty_response");
      let output;
      try {
        output = JSON.parse(text);
      } catch {
        throw new AIProviderError("AI provider returned malformed JSON", false, 502, null, "malformed_json");
      }
      return {
        output,
        provider: this.name,
        model: body.model || this.model,
        usage: {
          inputTokens: body.usage?.prompt_tokens || 0,
          outputTokens: body.usage?.completion_tokens || 0,
          estimatedCostUsd:
            ((body.usage?.prompt_tokens || 0) * config.aiInputCostPerMillion +
              (body.usage?.completion_tokens || 0) * config.aiOutputCostPerMillion) /
            1000000,
          latencyMs: Date.now() - started,
        },
      };
    } catch (error) {
      if (error.name === "AbortError") throw new AIProviderError("AI provider timed out", false, 504, null, "timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text, timeoutMs = config.aiTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      };
      if (this.baseUrl.includes("openrouter.ai") || this.name === "openrouter") {
        headers["HTTP-Referer"] = config.clientUrl || "http://localhost:5173";
        headers["X-Title"] = "HireSmart AI";
      }
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ model: this.model, input: String(text).slice(0, 30000) }),
      });
      if (!response.ok)
        throw new AIProviderError(
          `Embedding provider returned ${response.status}`,
          response.status === 429 || response.status >= 500,
          response.status,
        );
      const rawBody = await response.text();
      if (rawBody.length > 10_000_000)
        throw new AIProviderError("Embedding response exceeded the size limit");
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new AIProviderError("Embedding provider returned malformed JSON");
      }
      const vector = body.data?.[0]?.embedding || [];
      if (
        !Array.isArray(vector) ||
        vector.length > 10000 ||
        vector.some((value) => !Number.isFinite(value))
      )
        throw new AIProviderError("Embedding provider returned an invalid vector");
      return { vector, model: body.model || this.model, usage: body.usage || {} };
    } catch (error) {
      if (error.name === "AbortError")
        throw new AIProviderError("Embedding provider timed out", true);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

const getProvider = (name, purpose = "primary") => {
  if (name === "deterministic") return null;
  if (purpose === "fallback")
    return new OpenAICompatibleProvider({
      name,
      baseUrl: config.aiFallbackBaseUrl || config.aiBaseUrl,
      apiKey: config.aiFallbackApiKey || config.aiApiKey,
      model: config.aiFallbackModel || config.aiModel,
    });
  if (purpose === "embeddings")
    return new OpenAICompatibleProvider({
      name,
      baseUrl: config.embeddingsBaseUrl || config.aiBaseUrl,
      apiKey: config.embeddingsApiKey || config.aiApiKey,
      model: config.embeddingsModel,
    });
  return new OpenAICompatibleProvider({ name });
};

module.exports = { AIProviderError, OpenAICompatibleProvider, getProvider };
