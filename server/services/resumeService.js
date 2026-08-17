const path = require("node:path");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const { config } = require("../config/env");
const storageService = require("./storageService");

const normalizeText = (text) => {
    if (!text || typeof text !== "string") {
        return "";
    }

    return text.replace(/\s+/g, " ").trim();
};

const extractSummary = (text) => {
    const normalized = normalizeText(text);

    if (!normalized) {
        return "";
    }

    const sections = normalized
        .split(/\.|\n/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    return sections.slice(0, 4).join(". ").slice(0, 300).trim();
};

const parseResumeContent = async (buffer, originalName) => {
    const extension = path.extname(originalName).toLowerCase();

    try {
        // PDF extraction
        if (extension === ".pdf") {
            const parser = new PDFParse({ data: buffer });

            try {
                const result = await parser.getText();
                const normalized = normalizeText(result.text);

                return {
                    text: normalized,
                    summary: extractSummary(normalized),
                };
            } finally {
                await parser.destroy();
            }
        }

        // DOCX extraction
        if (extension === ".docx") {
            const result = await mammoth.extractRawText({ buffer });
            const normalized = normalizeText(result.value);

            return {
                text: normalized,
                summary: extractSummary(normalized),
            };
        }

        return {
            text: "",
            summary: "",
        };
    } catch (error) {
        console.error("Resume parsing error:", error);

        return {
            text: "",
            summary: "",
        };
    }
};

const uploadResume = async (file) => {
    if (!file || !file.buffer || !file.originalname) {
        throw new Error("Invalid resume file");
    }
    const deleteFile = async (storageKey, provider) => {
    return storageService.deleteFile(storageKey, provider);
};

    const { storageKey, provider } = await storageService.saveFile({
        buffer: file.buffer,
        originalName: file.originalname,
    });

    const parsed = await parseResumeContent(
        file.buffer,
        file.originalname
    );

    return {
        storageKey,
        provider,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        text: parsed.text,
        summary: parsed.summary,
    };
};

  const deleteFile = async (storageKey, provider) => {
    return storageService.deleteFile(storageKey, provider);
};


module.exports = {
    uploadResume,
    deleteFile,
};