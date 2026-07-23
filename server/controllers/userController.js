exports.getProfile = (req, res) => {

    return res.status(200).json({

        success: true,

        message: "Protected Route Accessed Successfully",

        user: req.user

    });

};

exports.adminDashboard = (req, res) => {

    return res.status(200).json({

        success: true,

        message: "Welcome Admin"

    });

};

exports.recruiterDashboard = (req, res) => {

    return res.status(200).json({

        success: true,

        message: "Welcome Recruiter"

    });

};

exports.candidateDashboard = (req, res) => {

    return res.status(200).json({

        success: true,

        message: "Welcome Candidate"

    });

};