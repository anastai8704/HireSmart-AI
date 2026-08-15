const normalizeSkill = (skill) =>
    String(skill || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

const extractKeywords = (text = "") => {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9+#.\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 2);
};

const calculateResumeJobMatch = ({
    resumeText = "",
    resumeSkills = [],
    jobSkills = [],
    jobDescription = "",
}) => {
    const normalizedResumeSkills = new Set(
        resumeSkills.map(normalizeSkill).filter(Boolean)
    );

    const normalizedJobSkills = [
        ...new Set(jobSkills.map(normalizeSkill).filter(Boolean)),
    ];

    const matchedSkills = normalizedJobSkills.filter((skill) =>
        normalizedResumeSkills.has(skill)
    );

    const missingSkills = normalizedJobSkills.filter(
        (skill) => !normalizedResumeSkills.has(skill)
    );

    const skillScore =
        normalizedJobSkills.length > 0
            ? (matchedSkills.length / normalizedJobSkills.length) * 100
            : 0;

    const resumeKeywords = new Set(extractKeywords(resumeText));
    const descriptionKeywords = extractKeywords(jobDescription);

    const uniqueDescriptionKeywords = [
        ...new Set(descriptionKeywords),
    ];

    const matchingDescriptionKeywords = uniqueDescriptionKeywords.filter(
        (keyword) => resumeKeywords.has(keyword)
    );

    const descriptionScore =
        uniqueDescriptionKeywords.length > 0
            ? (matchingDescriptionKeywords.length /
                  uniqueDescriptionKeywords.length) *
              100
            : 0;

    const matchScore =
        normalizedJobSkills.length > 0
            ? Math.round(skillScore * 0.8 + descriptionScore * 0.2)
            : Math.round(descriptionScore);

    return {
        matchScore: Math.min(100, Math.max(0, matchScore)),
        matchedSkills,
        missingSkills,
    };
};

module.exports = {
    calculateResumeJobMatch,
};