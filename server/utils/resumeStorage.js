const fs = require("node:fs");
const path = require("node:path");

const resumeDirectory = path.resolve(__dirname, "..", "uploads", "resumes");

const ensureResumeDirectory = () => {
    fs.mkdirSync(resumeDirectory, { recursive: true });
};

const getResumePath = (storedResume) => {
    if (!storedResume) {
        return null;
    }

    return path.join(resumeDirectory, path.basename(storedResume));
};

const removeStoredResume = async (storedResume) => {
    const filePath = getResumePath(storedResume);

    if (!filePath) {
        return;
    }

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
};

module.exports = {
    ensureResumeDirectory,
    getResumePath,
    removeStoredResume,
    resumeDirectory,
};
