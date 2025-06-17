// server.js
// Production-ready signaling server for p2pburger.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const config = require('./config'); // Import the configuration

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware ---
app.use(express.static('public'));

// --- Routes ---
app.get('/room/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.IO Signaling Logic ---
io.on('connection', (socket) => {
    console.log(`[Connection] User connected: ${socket.id}`);

    // Send the ICE server configuration to the newly connected client
    socket.emit('config', config.iceServers);

    socket.on('create or join', (roomId) => {
        console.log(`[Join Attempt] User ${socket.id} trying to join room ${roomId}`);

        const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
        const numClients = clientsInRoom ? clientsInRoom.size : 0;

        if (numClients === 0) {
            socket.join(roomId);
            socket.emit('created', roomId);
            console.log(`[Room Created] User ${socket.id} created room ${roomId}`);
        } else if (numClients === 1) {
            socket.join(roomId);
            socket.emit('joined', roomId);
            io.to(roomId).emit('ready'); // Notify both clients to start WebRTC handshake
            console.log(`[Room Joined] User ${socket.id} joined room ${roomId}`);
        } else { // Room is full
            socket.emit('full', roomId);
            console.log(`[Room Full] User ${socket.id} failed to join room ${roomId}`);
        }
    });

    socket.on('message', (message, roomId) => {
        // Relay messages to the other client in the room
        console.log(`[Message] Relaying message from ${socket.id} in room ${roomId}: ${message.type}`);
        socket.to(roomId).emit('message', message);
    });

    socket.on('disconnecting', () => {
        const rooms = Object.keys(socket.rooms);
        rooms.forEach(room => {
            if (room !== socket.id) {
                // Notify the other user in the room that their peer has disconnected
                socket.to(room).emit('peer-disconnected');
                console.log(`[Peer Disconnected] User ${socket.id} disconnected from room ${room}`);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`[Disconnection] User disconnected: ${socket.id}`);
    });
});

// --- Start Server ---
server.listen(config.port, () => {
  console.log(`🍔 p2pburger server running on http://localhost:${config.port}`);
});