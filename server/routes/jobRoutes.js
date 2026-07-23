const express = require("express");

const router = express.Router();

const { createJob } = require("../controllers/jobController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

router.post(
    "/",
    protect,
    authorize("recruiter", "admin"),
    createJob
);

module.exports = router;