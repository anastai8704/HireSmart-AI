const multer = require("multer");
const AppError = require("../utils/AppError");
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (req, file, cb) =>
    allowed.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError("Profile photos must be JPG, PNG or WebP", 415, "UNSUPPORTED_FILE_TYPE")),
});
