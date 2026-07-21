const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.register = async (req, res) => {
    try {

        const { name, email, password } = req.body;

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

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

        return res.status(201).json({
            success: true,
            message: "User Registered Successfully",
            user
        });

    } catch (error) {

        console.log(error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};