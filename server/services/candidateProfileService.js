const CandidateProfile = require("../models/CandidateProfile");
const AppError = require("../utils/AppError");

const getProfileByUserId = async (userId) => {
    return CandidateProfile.findOne({ user: userId }).populate(
        "user",
        "name email phone profileImage headline location bio skills resume"
    );
};

const createProfile = async (userId, profileData) => {
    const existingProfile = await CandidateProfile.findOne({
        user: userId,
    });

    if (existingProfile) {
        throw new AppError(
            "Candidate profile already exists",
            409
        );
    }

    const profile = await CandidateProfile.create({
        user: userId,
        ...profileData,
    });

    return profile.populate(
        "user",
        "name email phone profileImage headline location bio skills resume"
    );
};

const updateProfile = async (userId, profileData) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    Object.assign(profile, profileData);

    await profile.save();

    return profile.populate(
        "user",
        "name email phone profileImage headline location bio skills resume"
    );
};

const deleteProfile = async (userId) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    await CandidateProfile.deleteOne({
        _id: profile._id,
    });

    return {
        message: "Candidate profile deleted successfully",
    };
};

module.exports = {
    getProfileByUserId,
    createProfile,
    updateProfile,
    deleteProfile,
};