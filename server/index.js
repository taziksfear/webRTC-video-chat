const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3001;
const path = require('path');

let socketList = {};

app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('/*', function (req, res) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Route
app.get('/ping', (req, res) => {
  res
    .send({
      success: true,
    })
    .status(200);
});

// Socket
io.on('connection', (socket) => {
  console.log(`New User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete socketList[socket.id];
    socket.disconnect();
  });

  socket.on('BE-check-user', ({ roomId, userName }) => {
    console.log(`Checking user: ${userName} in room: ${roomId}`);
    let error = false;

    io.sockets.in(roomId).clients((err, clients) => {
      if (err) {
        console.error('Error fetching clients:', err);
        return;
      }

      clients.forEach((client) => {
        if (socketList[client] && socketList[client].userName === userName) {
          error = true;
        }
      });

      console.log(`User check result: ${error ? 'Error' : 'Success'}`);
      socket.emit('FE-error-user-exist', { error });
    });
  });

  socket.on('BE-join-room', ({ roomId, userName }) => {
    console.log(`User ${userName} joining room ${roomId}`);
    socket.join(roomId);
    socketList[socket.id] = { userName, video: true, audio: true };

    io.sockets.in(roomId).clients((err, clients) => {
      try {
        const users = [];
        clients.forEach((client) => {
          if (socketList[client]) {
            users.push({ userId: client, info: socketList[client] });
          }
        });
        console.log(`Users in room ${roomId}:`, users);
        socket.broadcast.to(roomId).emit('FE-user-join', users);
      } catch (e) {
        console.error('Error in BE-join-room:', e);
        io.sockets.in(roomId).emit('FE-error-user-exist', { err: true });
      }
    });
  });

  socket.on('BE-call-user', ({ userToCall, from, signal }) => {
    const callerInfo = socketList[from];
    if (callerInfo) {
      console.log(`Calling user ${userToCall} from ${callerInfo.userName}`);
      io.to(userToCall).emit('FE-receive-call', {
        signal,
        from,
        info: { userName: callerInfo.userName, video: callerInfo.video, audio: callerInfo.audio },
      });
    } else {
      console.error(`Caller info not found for socket ID: ${from}`);
    }
  });

  socket.on('BE-accept-call', ({ signal, to }) => {
    console.log(`Accepting call from ${to}`);
    io.to(to).emit('FE-call-accepted', { signal, answerId: socket.id });
  });

  socket.on('BE-send-message', ({ roomId, msg, sender }) => {
    console.log(`Message from ${sender} in room ${roomId}: ${msg}`);
    io.sockets.in(roomId).emit('FE-receive-message', { msg, sender });
  });

  socket.on('BE-leave-room', ({ roomId, leaver }) => {
    const leaverInfo = socketList[socket.id];
    if (leaverInfo) {
      delete socketList[socket.id];
      socket.broadcast.to(roomId).emit('FE-user-leave', {
        userId: socket.id,
        userName: leaverInfo.userName,
      });
      console.log(`User ${leaverInfo.userName} left room ${roomId}`);
    }
    socket.leave(roomId);
  });

  socket.on('BE-toggle-camera-audio', ({ roomId, switchTarget }) => {
    if (socketList[socket.id]) {
      if (switchTarget === 'video') {
        socketList[socket.id].video = !socketList[socket.id].video;
      } else {
        socketList[socket.id].audio = !socketList[socket.id].audio;
      }

      socket.broadcast.to(roomId).emit('FE-toggle-camera', {
        userId: socket.id,
        switchTarget,
        video: socketList[socket.id].video,
        audio: socketList[socket.id].audio,
      });
      console.log(`User ${socketList[socket.id].userName} toggled ${switchTarget}`);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});