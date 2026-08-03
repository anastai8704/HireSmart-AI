import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/db';
import { setupRoutes } from './app';
import { setupSocket } from './sockets';
import { config } from './config/env';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Connect to the database
connectDB();

// Middleware and routes setup
setupRoutes(app);
setupSocket(io);

// Start the server
const PORT = config.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});