const crypto = require("node:crypto");

const createToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  return {
    token,
    hashedToken,
  };
};

const hashToken = (token) => {
  if (!token) {
    return null;
  }

  return crypto.createHash("sha256").update(token).digest("hex");
};

module.exports = {
  createToken,
  hashToken,
};
