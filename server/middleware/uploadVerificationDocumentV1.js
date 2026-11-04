// Single-file upload for company verification documents. The file is held in memory only until
// services/companyVerificationService.addDocument has checked its real content and stored it privately.
const multer = require("multer");
const AppError = require("../utils/AppError");
const { DOCUMENT_LIMITS } = require("../domain/verificationRules");

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_LIMITS.maxBytes, files: 1, fields: 5 },
  fileFilter: (req, file, cb) =>
    ALLOWED_MIME_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError("Only PDF, JPEG and PNG documents are accepted", 415, "UNSUPPORTED_FILE_TYPE")),
}).single("file");

module.exports = (req, res, next) =>
  uploader(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === "LIMIT_FILE_SIZE")
        return next(new AppError("The uploaded file is too large", 413, "FILE_TOO_LARGE"));
      return next(new AppError("The upload could not be read", 400, "INVALID_UPLOAD"));
    }
    if (!req.file) return next(new AppError("Choose a file to upload", 422, "MISSING_FILE"));
    return next();
  });
