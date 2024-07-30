const { Server } = require("socket.io");
const http = require("http");

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();

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

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("room:join", (data) => {
    const { email, room } = data;
    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);
    io.to(room).emit("user:joined", { email, id: socket.id });
    socket.join(room);
    io.to(socket.id).emit("room:join", data);
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

  socket.on("disconnect", () => {
    const email = socketIdToEmailMap.get(socket.id);
    emailToSocketIdMap.delete(email);
    socketIdToEmailMap.delete(socket.id);
    console.log("socket disconnected", socket.id);
  });
});

const port = process.env.PORT || 8000;
httpServer.listen(port, () => console.log(`Server is running on port ${port}`));

module.exports = httpServer;
