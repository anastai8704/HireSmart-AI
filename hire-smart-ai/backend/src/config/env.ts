import dotenv from 'dotenv';

dotenv.config();

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || '',
  REDIS_URL: process.env.REDIS_URL || '',
  CLOUDINARY_URL: process.env.CLOUDINARY_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  EMAIL_SERVICE: process.env.EMAIL_SERVICE || '',
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  // Add other environment variables as needed
};

export default env;