const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

const generateJwtToken = (payload) => {
    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
    });
};

const buildUserResponse = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    profileImage: user.profileImage,
    resume: user.resume
        ? {
              provider: user.resumeProvider || "local",
              originalName: user.resumeOriginalName,
              mimeType: user.resumeMimeType,
              size: user.resumeSize,
              uploadedAt: user.resumeUploadedAt,
          }
        : null,
});

module.exports = {
    generateJwtToken,
    buildUserResponse,
};
