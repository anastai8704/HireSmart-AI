import { config } from 'dotenv';

config();

const appConfig = {
  port: process.env.PORT || 5000,
  env: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api',
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret',
  jwtExpiration: process.env.JWT_EXPIRATION || '1h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default appConfig;