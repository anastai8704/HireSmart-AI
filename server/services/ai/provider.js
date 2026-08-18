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
            const body = await response.json();
            const text = body.choices?.[0]?.message?.content;
            if (!text) throw new AIProviderError("AI provider returned an empty response");
            let output; try { output = JSON.parse(text); } catch { throw new AIProviderError("AI provider returned malformed JSON"); }
            return { output, provider: this.name, model: body.model || this.model, usage: { inputTokens: body.usage?.prompt_tokens || 0, outputTokens: body.usage?.completion_tokens || 0, estimatedCostUsd: (((body.usage?.prompt_tokens || 0) * config.aiInputCostPerMillion) + ((body.usage?.completion_tokens || 0) * config.aiOutputCostPerMillion)) / 1000000, latencyMs: Date.now() - started } };
        } catch (error) { if (error.name === "AbortError") throw new AIProviderError("AI provider timed out", true); throw error; } finally { clearTimeout(timer); }
    }
    async embed(text) {
        const response = await fetch(`${this.baseUrl}/embeddings`, { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: config.embeddingsModel, input: String(text).slice(0, 30000) }) });
        if (!response.ok) throw new AIProviderError(`Embedding provider returned ${response.status}`, response.status === 429 || response.status >= 500);
        const body = await response.json(); return { vector: body.data?.[0]?.embedding || [], model: body.model || config.embeddingsModel, usage: body.usage || {} };
    }
}
const getProvider = (name) => name === "deterministic" ? null : new OpenAICompatibleProvider({ name });
module.exports = { AIProviderError, OpenAICompatibleProvider, getProvider };
