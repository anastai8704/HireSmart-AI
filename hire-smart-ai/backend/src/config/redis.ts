import { createClient } from 'redis';
import { env } from './env';

const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

const connectRedis = async () => {
  await redisClient.connect();
};

export { redisClient, connectRedis };