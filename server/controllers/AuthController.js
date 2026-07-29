const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.register = async (req, res) => {
    try {

        const { name, email, password, role } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Check existing user
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        //invalid roles
        const allowedRoles = ["candidate", "recruiter", "admin"];

        if (role && !allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role",
    });
}

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || "candidate"
        });

        // Response object
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            profileImage: user.profileImage,
        };

        return res.status(201).json({
            success: true,
            message: "User Registered Successfully",
            user: userResponse,
        });

    } catch (error) {
        console.error("Register Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};
exports.login = async (req, res) => {
    try {

        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and Password are required"
            });
        }

        // Check user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid Password"
            });
        }

        // Generate Token
        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            profileImage: user.profileImage,
        };

        return res.status(200).json({
            success: true,
            message: "Login Successful",
            token,
            user: userResponse
        });

    } catch (error) {

        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};
// ==========================
// Upload Resume
// ==========================
exports.uploadResume = async (req, res) => {

    try {

        if (!req.file) {

            return res.status(400).json({

                success: false,

                message: "Please upload resume"

            });

        }

        const user = await User.findById(req.user.id);

        user.resume = req.file.path.replace(/\\/g, "/");
        user.resumeOriginalName = req.file.originalname;
        user.resumeMimeType = req.file.mimetype;
        user.resumeSize = req.file.size;

        await user.save();

        return res.status(200).json({

            success: true,

            message: "Resume uploaded successfully",

            resume: user.resume

        });

    } catch (error) {

        console.log(error);

        return res.status(500).json({

            success: false,

            message: "Server Error"

        });

    }

};