const fs = require("node:fs");
const path = require("node:path");

const resumeDirectory = path.resolve(__dirname, "..", "uploads", "resumes");
const avatarDirectory = path.join(resumeDirectory, "avatars");

const ensureResumeDirectory = () => {
  fs.mkdirSync(resumeDirectory, { recursive: true });
};

const ensureAvatarDirectory = () => {
  fs.mkdirSync(avatarDirectory, { recursive: true });
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
  ensureAvatarDirectory,
  getResumePath,
  removeStoredResume,
  resumeDirectory,
  avatarDirectory,
};
