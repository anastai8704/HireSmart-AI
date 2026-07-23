const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {

    try {

        let token;

        // Get Token
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {

            token = req.headers.authorization.split(" ")[1];

        }

        // No Token
        if (!token) {

            return res.status(401).json({

                success: false,
                message: "Access Denied. No Token Provided."

            });

        }

        // Verify Token

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Save User Information

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({

            success: false,
            message: "Invalid or Expired Token"

        });

    }

};