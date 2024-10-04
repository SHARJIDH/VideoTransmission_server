const { Server } = require("socket.io");
const http = require("http");
const crypto = require("crypto");

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();
const rooms = new Map();

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function generateRoomId() {
  return crypto.randomBytes(4).toString("hex");
}

function generatePassword() {
  return crypto.randomBytes(3).toString("hex");
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("room:create", ({ email }) => {
    console.log("room:create event received with email:", email);
    const roomId = generateRoomId();
    const password = generatePassword();
    rooms.set(roomId, {
      password,
      creator: socket.id,
      participants: new Set([socket.id]),
    });
    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);
    socket.join(roomId);
    io.to(socket.id).emit("room:created", { email, roomId, password });
  });

  socket.on("room:join", ({ email, roomId, password }) => {
    const room = rooms.get(roomId);
    if (room && room.password === password) {
      emailToSocketIdMap.set(email, socket.id);
      socketIdToEmailMap.set(socket.id, email);
      room.participants.add(socket.id);
      io.to(room.creator).emit("user:joined", { email, id: socket.id });
      socket.join(roomId);
      io.to(socket.id).emit("room:joined", { email, roomId });
    } else {
      io.to(socket.id).emit("room:join_error", {
        message: "Invalid room ID or password",
      });
    }
  });

  socket.on("join-room", ({ roomId, email }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.participants.add(socket.id);
      socket.join(roomId);
      const usersInThisRoom = Array.from(room.participants).filter(
        (id) => id !== socket.id
      );
      socket.emit("all-users", usersInThisRoom);
      socket.to(roomId).emit("user-joined", { id: socket.id, email });
    } else {
      socket.emit("room:join_error", { message: "Room not found" });
    }
  });

  socket.on("sending-signal", ({ to, from, signal }) => {
    io.to(to).emit("user-joined", { signal, from });
  });

  socket.on("returning-signal", ({ to, signal }) => {
    io.to(to).emit("receiving-returned-signal", { signal, id: socket.id });
  });

  socket.on("user:call", ({ to, offer, key }) => {
    io.to(to).emit("incoming:call", { from: socket.id, offer, key });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("room:leave", ({ roomId }) => {
    console.log(`User ${socket.id} is leaving room ${roomId}`);
    const room = rooms.get(roomId);
    if (room) {
      room.participants.delete(socket.id);
      socket.to(roomId).emit("user-left", { id: socket.id });
      socket.leave(roomId);
      console.log(`User ${socket.id} has left room ${roomId}`);

      // If the room is empty after this user leaves, you might want to delete it
      if (room.participants.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} has been deleted as it's empty`);
      }
    }
  });

  socket.on("room:rejoin", ({ roomId, email }) => {
    const room = rooms.get(roomId);
    if (room) {
      emailToSocketIdMap.set(email, socket.id);
      socketIdToEmailMap.set(socket.id, email);
      room.participants.add(socket.id);
      socket.join(roomId);
      io.to(socket.id).emit("room:joined", { email, roomId });
      // Notify other participants about the new user
      socket.to(roomId).emit("user:joined", { email, id: socket.id });
    } else {
      io.to(socket.id).emit("room:join_error", {
        message: "Room not found",
      });
    }
  });

  socket.on("disconnect", () => {
    const email = socketIdToEmailMap.get(socket.id);
    emailToSocketIdMap.delete(email);
    socketIdToEmailMap.delete(socket.id);
    rooms.forEach((room, roomId) => {
      if (room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
          rooms.delete(roomId);
        } else if (room.creator === socket.id) {
          // If the creator disconnects, assign a new creator
          const newCreator = room.participants.values().next().value;
          room.creator = newCreator;
        }
        io.to(roomId).emit("user:left", { id: socket.id });
      }
    });
    console.log("socket disconnected", socket.id);
  });
});

const port = process.env.PORT || 8000;
httpServer.listen(port, () => console.log(`Server is running on port ${port}`));

module.exports = httpServer;
