const express = require("express"),
  http = require("http"),
  socketio = require("socket.io"),
  config = require("./config"),
  cookie = require("cookie"),
  Bet365 = require("./bookmakers/bet365/bkWorker"),
  SportsBet = require("./bookmakers/sportsBet/bkWorker");

const app = express();

//?================================================================================================Express

var server = http.createServer(app).listen(config.PORT, function () {
  console.log(
    `\n\t[Obverse Backend]\n\t--EXPRESS SERVER\nStarted at port ${config.PORT}`
  );
});

var io = socketio.listen(server);
//?================================================================================================SocketIO

io.sockets.on("connection", function (socket) {
  socket.join("default");
});

//?================================================================================================Bookmakers
const bet365 = new Bet365(io);
const sportsBet = new SportsBet(io);

async function run(){
  bet365.worker();
  sportsBet.worker();
}

run();
