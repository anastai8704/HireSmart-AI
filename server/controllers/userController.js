exports.getProfile = (req, res) => {

    return res.status(200).json({

        success: true,

        message: "Protected Route Accessed Successfully",

        user: req.user

    });

};