const express = require("express");
const router = express.Router();

const {
    register,
    registerRecruiter,
    createRecruiter,
    login,
    uploadResume,
    deleteResume,
    downloadMyResume,
} = require("../controllers/AuthController");

const {
    protect,
    authorize,
} = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadResume");


router.post("/register", register);

router.post("/register-recruiter", registerRecruiter);

router.post("/login", login);

router.post(
    "/recruiters",
    protect,
    authorize("admin"),
    createRecruiter
);

router.put(
    "/resume",
    protect,
    authorize("candidate"),
    upload.single("resume"),
    uploadResume
);

router.delete(
    "/resume",
    protect,
    authorize("candidate"),
    deleteResume
);

router.get(
    "/resume",
    protect,
    authorize("candidate"),
    downloadMyResume
);

module.exports = router;
