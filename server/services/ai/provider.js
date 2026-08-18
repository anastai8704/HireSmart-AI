const { config } = require("../../config/env");

class AIProviderError extends Error { constructor(message, retryable = false) { super(message); this.retryable = retryable; } }
class OpenAICompatibleProvider {
    constructor({ name = "openai-compatible", baseUrl = config.aiBaseUrl, apiKey = config.aiApiKey, model = config.aiModel } = {}) { this.name = name; this.baseUrl = baseUrl.replace(/\/$/, ""); this.apiKey = apiKey; this.model = model; }
    async generateStructured({ system, prompt, schemaName, timeoutMs = config.aiTimeoutMs }) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model: this.model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: `${system}\nReturn only valid JSON for schema ${schemaName}.` }, { role: "user", content: prompt }] }) });
            if (!response.ok) throw new AIProviderError(`AI provider returned ${response.status}`, response.status === 429 || response.status >= 500);
            const rawBody = await response.text(); if (rawBody.length > 2_000_000) throw new AIProviderError("AI provider response exceeded the size limit");
            let body; try { body = JSON.parse(rawBody); } catch { throw new AIProviderError("AI provider returned malformed HTTP JSON"); }
            const text = body.choices?.[0]?.message?.content;
            if (!text) throw new AIProviderError("AI provider returned an empty response");
            let output; try { output = JSON.parse(text); } catch { throw new AIProviderError("AI provider returned malformed JSON"); }
            return { output, provider: this.name, model: body.model || this.model, usage: { inputTokens: body.usage?.prompt_tokens || 0, outputTokens: body.usage?.completion_tokens || 0, estimatedCostUsd: (((body.usage?.prompt_tokens || 0) * config.aiInputCostPerMillion) + ((body.usage?.completion_tokens || 0) * config.aiOutputCostPerMillion)) / 1000000, latencyMs: Date.now() - started } };
        } catch (error) { if (error.name === "AbortError") throw new AIProviderError("AI provider timed out", true); throw error; } finally { clearTimeout(timer); }
    }
    async embed(text, timeoutMs = config.aiTimeoutMs) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model: this.model, input: String(text).slice(0, 30000) }) });
            if (!response.ok) throw new AIProviderError(`Embedding provider returned ${response.status}`, response.status === 429 || response.status >= 500);
            const rawBody = await response.text(); if (rawBody.length > 10_000_000) throw new AIProviderError("Embedding response exceeded the size limit");
            let body; try { body = JSON.parse(rawBody); } catch { throw new AIProviderError("Embedding provider returned malformed JSON"); }
            const vector = body.data?.[0]?.embedding || []; if (!Array.isArray(vector) || vector.length > 10000 || vector.some((value) => !Number.isFinite(value))) throw new AIProviderError("Embedding provider returned an invalid vector");
            return { vector, model: body.model || this.model, usage: body.usage || {} };
        } catch (error) { if (error.name === "AbortError") throw new AIProviderError("Embedding provider timed out", true); throw error; } finally { clearTimeout(timer); }
    }
}
const getProvider = (name, purpose = "primary") => {
    if (name === "deterministic") return null;
    if (purpose === "fallback") return new OpenAICompatibleProvider({ name, baseUrl: config.aiFallbackBaseUrl || config.aiBaseUrl, apiKey: config.aiFallbackApiKey || config.aiApiKey, model: config.aiFallbackModel || config.aiModel });
    if (purpose === "embeddings") return new OpenAICompatibleProvider({ name, baseUrl: config.embeddingsBaseUrl || config.aiBaseUrl, apiKey: config.embeddingsApiKey || config.aiApiKey, model: config.embeddingsModel });
    return new OpenAICompatibleProvider({ name });
};
module.exports = { AIProviderError, OpenAICompatibleProvider, getProvider };
