const path = require("node:path");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const storageService = require("./storageService");
const logger = require("../utils/logger");

const normalizeText = (text) => typeof text === "string" ? text.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
const extractSummary = (text) => normalizeText(text).split(/\n|(?<=[.!?])\s+/).filter(Boolean).slice(0, 4).join(" ").slice(0, 500);
const parseResumeContent = async (buffer, originalName) => {
    const extension = path.extname(originalName).toLowerCase();
    try {
        if (extension === ".pdf") {
            const parser = new PDFParse({ data: buffer });
            try { const result = await parser.getText(); const text = normalizeText(result.text); return { text, summary: extractSummary(text) }; }
            finally { await parser.destroy(); }
        }
        if (extension === ".docx") { const result = await mammoth.extractRawText({ buffer }); const text = normalizeText(result.value); return { text, summary: extractSummary(text) }; }
        return { text: "", summary: "" };
    } catch (error) { logger.warn(`Resume parser rejected ${extension || "unknown"} input: ${error.message}`); return { text: "", summary: "" }; }
};
const uploadResume = async (file) => {
    if (!file?.buffer || !file.originalname) throw new Error("Invalid resume file");
    const stored = await storageService.saveFile({ buffer: file.buffer, originalName: file.originalname });
    const parsed = await parseResumeContent(file.buffer, file.originalname);
    return { storageKey: stored.storageKey, provider: stored.provider, originalName: file.originalname, mimeType: file.mimetype, size: file.size, uploadedAt: new Date(), text: parsed.text, summary: parsed.summary };
};
const deleteFile = (storageKey, provider) => storageService.deleteFile(storageKey, provider);
module.exports = { uploadResume, deleteFile, parseResumeContent, normalizeText };
