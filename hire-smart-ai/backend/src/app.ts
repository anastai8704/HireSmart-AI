import express from 'express';
import { json, urlencoded } from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDB } from './config/db';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

const app = express();

// Middleware setup
app.use(cors());
app.use(helmet());
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(morgan('dev'));

// Database connection
connectDB();

// Routes
app.use('/api', routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;