const crypto = require("node:crypto");
module.exports = (req, res, next) => {
    const supplied = req.get("x-request-id");
    req.id = supplied && /^[a-zA-Z0-9._-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
};
