const multer = require("multer");
const AppError = require("../utils/AppError");
const allowed = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) =>
    allowed.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError("Only PDF and DOCX resumes are supported", 415, "UNSUPPORTED_FILE_TYPE")),
});
