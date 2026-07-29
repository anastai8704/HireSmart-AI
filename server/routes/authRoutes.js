const express = require("express");
const router = express.Router();

const {
    protect,
    authorize,
} = require("../middleware/authMiddleware");

const {
    register,
    login,
    uploadResume,
} = require("../controllers/authController");

const upload = require("../middleware/uploadResume");

router.post("/register", register);

router.post("/login", login);

router.put(
    "/resume",
    protect,
    authorize("candidate"),
    upload.single("resume"),
    uploadResume
);

module.exports = router;