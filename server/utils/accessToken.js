// Access-token (JWT) rules in one place. Signing and verification must use the same algorithm and claims.
// The algorithm is pinned: a token claiming "none" or any other algorithm is rejected.
const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "hiresmart-api";
const JWT_AUDIENCE = "hiresmart-web";

const signOptions = (subject) => ({
  algorithm: JWT_ALGORITHM,
  subject,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  expiresIn: config.accessTokenExpiresIn,
});

const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwtSecret, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

module.exports = { JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE, signOptions, verifyAccessToken };
