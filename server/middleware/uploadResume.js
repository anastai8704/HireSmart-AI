const multer = require("multer");
const path = require("path");
const AppError = require("../utils/AppError");
const {
    ensureResumeDirectory,
    resumeDirectory,
} = require("../utils/resumeStorage");

ensureResumeDirectory();

const supportedFiles = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const storage = multer.diskStorage({

    destination(req, file, cb) {
        cb(null, resumeDirectory);
    },

    filename(req, file, cb) {

        const uniqueName =
            Date.now() + "-" + Math.round(Math.random() * 1E9);

        cb(
            null,
            uniqueName + path.extname(file.originalname)
        );

    }

});

const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (supportedFiles[extension] !== file.mimetype) {
        return cb(new AppError("Only PDF, DOC, and DOCX resumes are allowed", 400));
    }

    cb(null, true);

};

module.exports = multer({

    storage,

    fileFilter,

    limits: {

        fileSize: 5 * 1024 * 1024

    }

});
