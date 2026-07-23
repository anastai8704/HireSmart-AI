const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {

    try {

        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {

            token = req.headers.authorization.split(" ")[1];

        }

        if (!token) {

            return res.status(401).json({
                success: false,
                message: "Access Denied. No Token Provided."
            });

        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const user = await User
            .findById(decoded.id)
            .select("-password");

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        req.user = user;

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Invalid or Expired Token"
        });

    }

};
exports.authorize = (...roles) => {

    return (req, res, next) => {

        if (!roles.includes(req.user.role)) {

            return res.status(403).json({

                success: false,

                message: "You are not authorized to access this resource."

            });

        }

        next();

    };

};