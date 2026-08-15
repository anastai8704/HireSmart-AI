const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const { connectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const User = require("../models/User");

const main = async () => {
    validateEnvironment();

    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        throw new Error(
            "ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required to bootstrap an admin"
        );
    }

    if (ADMIN_PASSWORD.length < 8) {
        throw new Error("ADMIN_PASSWORD must contain at least 8 characters");
    }

    await connectDB();

    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existingUser = await User.findOne({ email });

    if (existingUser) {
        if (existingUser.role === "admin") {
            console.log("Admin account already exists; no changes were made.");
            return;
        }

        throw new Error("The configured admin email belongs to a non-admin account");
    }

    await User.create({
        name: ADMIN_NAME.trim(),
        email,
        password: await bcrypt.hash(ADMIN_PASSWORD, 8),
        role: "admin",
    });

    console.log("Admin account created successfully.");
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
