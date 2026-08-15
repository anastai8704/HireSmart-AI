/**
 * textAnalysis.js
 * -----------------------------------------------------------------------------
 * Low-level text utilities shared by the resume-matching engine.
 *
 * WHY THIS FILE EXISTS
 * The original matching code compared raw words. That is fragile: "React.js",
 * "reactjs" and "React" all mean the same skill to a human but were three
 * different strings to the computer, and a job description full of words like
 * "the", "and", "we" would dilute every score.
 *
 * Here we build the classic Information-Retrieval building blocks:
 *   1. tokenisation  - split text into comparable words
 *   2. stop-words    - throw away words that carry no meaning
 *   3. stemming      - "developing"/"developed"/"develops" -> "develop"
 *   4. synonyms      - "js" -> "javascript"
 *   5. TF-IDF        - weigh rare, meaningful words higher than common ones
 *   6. cosine sim.   - measure how similar two weighted word-vectors are
 *
 * Nothing here needs an API key or a network call, so scoring always works.
 */

/**
 * Words so common in English (and in job adverts) that their presence tells us
 * nothing about whether a candidate fits a role.
 */
const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", "at",
    "by", "for", "with", "about", "against", "between", "into", "through",
    "during", "before", "after", "above", "below", "to", "from", "up", "down",
    "in", "out", "on", "off", "over", "under", "again", "further", "once",
    "here", "there", "all", "any", "both", "each", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "can", "will", "just", "should", "now", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do",
    "does", "did", "doing", "would", "could", "ought", "i", "you", "he", "she",
    "it", "we", "they", "them", "their", "our", "your", "my", "me", "him",
    "her", "his", "its", "this", "that", "these", "those", "am", "as", "of",
    // Recruitment boilerplate that appears in almost every job advert.
    "job", "role", "work", "working", "team", "company", "candidate", "looking",
    "years", "year", "experience", "strong", "good", "excellent", "ability",
    "responsibilities", "requirements", "must", "plus", "etc", "join", "help",
    "using", "use", "used", "new", "well", "also", "within", "across", "who",
    "what", "which", "you'll", "we're", "please", "apply", "opportunity",
]);

/**
 * Different spellings that mean the same technology. Everything is normalised
 * to the value on the right so "JS", "Node" and "postgres" match correctly.
 */
const SYNONYMS = new Map(Object.entries({
    js: "javascript",
    ts: "typescript",
    reactjs: "react",
    "react.js": "react",
    nodejs: "node",
    "node.js": "node",
    expressjs: "express",
    "express.js": "express",
    vuejs: "vue",
    "vue.js": "vue",
    nextjs: "next",
    "next.js": "next",
    postgres: "postgresql",
    mongo: "mongodb",
    "c#": "csharp",
    "c++": "cplusplus",
    golang: "go",
    py: "python",
    ml: "machinelearning",
    "machine learning": "machinelearning",
    ai: "artificialintelligence",
    "artificial intelligence": "artificialintelligence",
    dl: "deeplearning",
    "deep learning": "deeplearning",
    k8s: "kubernetes",
    gcp: "googlecloud",
    "google cloud": "googlecloud",
    aws: "amazonwebservices",
    "amazon web services": "amazonwebservices",
    ci: "cicd",
    "ci/cd": "cicd",
    rest: "restapi",
    "rest api": "restapi",
    "restful": "restapi",
    db: "database",
    ui: "userinterface",
    ux: "userexperience",
    oop: "objectoriented",
    tailwindcss: "tailwind",
    "html5": "html",
    "css3": "css",
}));

/**
 * A deliberately small, readable suffix-stripping stemmer (a simplified Porter
 * stemmer). Turning "developing", "developed" and "develops" into the single
 * root "develop" means all three count as the same evidence of a skill.
 */
const stem = (word) => {
    let result = word;

    // Plurals and third-person verbs.
    if (result.length > 4 && result.endsWith("ies")) {
        result = `${result.slice(0, -3)}y`;
    } else if (result.length > 3 && result.endsWith("es")) {
        result = result.slice(0, -2);
    } else if (result.length > 3 && result.endsWith("s") && !result.endsWith("ss")) {
        result = result.slice(0, -1);
    }

    // Common verb / noun endings.
    for (const suffix of ["ing", "edly", "ed", "ly", "ment", "ness", "ity"]) {
        if (result.length > suffix.length + 3 && result.endsWith(suffix)) {
            result = result.slice(0, -suffix.length);
            break;
        }
    }

    return result;
};

/**
 * Normalises a single skill string so that "  React.JS " and "reactjs" become
 * the identical token "react".
 */
const normalizeSkill = (skill) => {
    const cleaned = String(skill || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

    if (!cleaned) {
        return "";
    }

    // Check the multi-word form first ("machine learning"), then the compact
    // form without punctuation/spaces ("machinelearning").
    if (SYNONYMS.has(cleaned)) {
        return SYNONYMS.get(cleaned);
    }

    const compact = cleaned.replace(/[\s._-]/g, "");
    return SYNONYMS.get(compact) || compact;
};

/**
 * Splits free text into a list of meaningful, stemmed tokens.
 */
const tokenize = (text, { keepStopWords = false } = {}) => {
    const words = String(text || "")
        .toLowerCase()
        // Keep +, # and . because they are part of real skills (c++, c#, node.js).
        .replace(/[^a-z0-9+#.\s-]/g, " ")
        .split(/[\s,\-/|]+/)
        .map((word) => word.replace(/^[.]+|[.]+$/g, ""))
        .filter(Boolean);

    const tokens = [];

    for (const word of words) {
        if (word.length < 2) continue;
        if (!keepStopWords && STOP_WORDS.has(word)) continue;

        const canonical = SYNONYMS.get(word) || word;
        tokens.push(stem(canonical));
    }

    return tokens;
};

/**
 * Counts how often each token appears: { react: 3, node: 1 }.
 */
const termFrequency = (tokens) => {
    const counts = new Map();

    for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
    }

    return counts;
};

/**
 * Builds TF-IDF vectors for a set of documents.
 *
 * TF  (term frequency)        - how often a word appears in THIS document.
 * IDF (inverse document freq) - how rare the word is across ALL documents.
 *
 * Multiplying them means a word like "kubernetes" (rare, appears twice) scores
 * much higher than "experience" (appears in every document).
 */
const buildTfIdfVectors = (documents) => {
    const tokenised = documents.map((doc) => tokenize(doc));
    const documentCount = documents.length || 1;

    // In how many documents does each token appear at least once?
    const documentFrequency = new Map();

    for (const tokens of tokenised) {
        for (const token of new Set(tokens)) {
            documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
        }
    }

    return tokenised.map((tokens) => {
        const frequencies = termFrequency(tokens);
        const total = tokens.length || 1;
        const vector = new Map();

        for (const [token, count] of frequencies) {
            const tf = count / total;
            // The +1s (smoothing) stop us dividing by zero and keep IDF positive.
            const idf = Math.log((1 + documentCount) / (1 + documentFrequency.get(token))) + 1;
            vector.set(token, tf * idf);
        }

        return vector;
    });
};

/**
 * Cosine similarity: the angle between two vectors, from 0 (nothing in common)
 * to 1 (identical). We use the angle rather than raw overlap so that a long
 * resume is not automatically judged a better match than a concise one.
 */
const cosineSimilarity = (vectorA, vectorB) => {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const [token, weight] of vectorA) {
        magnitudeA += weight * weight;

        const otherWeight = vectorB.get(token);
        if (otherWeight) {
            dotProduct += weight * otherWeight;
        }
    }

    for (const weight of vectorB.values()) {
        magnitudeB += weight * weight;
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
};

/**
 * Pulls the number of years of experience out of free text.
 * Understands "5 years", "5+ years", "3-5 years" and "over 4 years".
 */
const extractYearsOfExperience = (text) => {
    const source = String(text || "").toLowerCase();
    const patterns = [
        /(\d+)\s*\+?\s*(?:-|to)\s*(\d+)\s*\+?\s*year/g, // "3-5 years" -> take the lower bound
        /(?:over|above|minimum|min|at least)\s*(\d+)\s*\+?\s*year/g,
        /(\d+)\s*\+\s*year/g,
        /(\d+)\s*year/g,
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(source);

        if (match) {
            return Number(match[1]);
        }
    }

    return null;
};

module.exports = {
    STOP_WORDS,
    SYNONYMS,
    stem,
    normalizeSkill,
    tokenize,
    termFrequency,
    buildTfIdfVectors,
    cosineSimilarity,
    extractYearsOfExperience,
};
