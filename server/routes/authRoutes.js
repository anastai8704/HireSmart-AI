const express = require("express");
const router = express.Router();

const {
    register,
    login,
    uploadResume,
    deleteResume,
} = require("../controllers/authController");

const {
    protect,
    authorize,
} = require("../middleware/authMiddleware");

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

router.delete(
    "/resume",
    protect,
    authorize("candidate"),
    deleteResume
);

module.exports = router;