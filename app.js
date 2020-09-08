const express = require("express"),
  http = require("http"),
  socketio = require("socket.io"),
  config = require("./config"),
  cookie = require("cookie"),
  Bet365 = require("./bookmakers/bet365/bkWorker"),
  SportsBet = require("./bookmakers/sportsBet/bkWorker"),
  fs = require("fs");

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

async function run() {
  bet365.worker((bet, type, data) => {
    if (type == "Event")
    doStatB(data)
  });
  sportsBet.worker((bet, type, data) => {
    if (type == "Event")
    doStatS(data)
  });
}
//this.io.sockets.in("default").emit("Bet365Cancel", event.ID);
run();
//?================================================================================================STAT
var bet365STAT = [];
var sportsBet365STAT = [];

function doStatB(event) {
  let odds = correctNames(event);
  for (item in odds) {
    let isContains = bet365STAT.find((i) => i.name == item) || null;
    if (!isContains) bet365STAT.push({ name: item, count: 1 });
    else bet365STAT[bet365STAT.indexOf(isContains)].count++;
  }
}

function doStatS(event) {
  let odds = correctNames(event);
  for (item in odds) {
    let isContains = sportsBet365STAT.find((i) => i.name == item) || null;
    if (!isContains) sportsBet365STAT.push({ name: item, count: 1 });
    else sportsBet365STAT[sportsBet365STAT.indexOf(isContains)].count++;
  }
}

function correctNames(event) {
  if (!event.TM)
  console.log(":)");
  let TM = event.TM;
  let OD = event.OD;
  for (item in OD) {
    let newName = item;
    TM.forEach((team, index) => {
      if (newName.includes(team)) {
        let reg = new RegExp(`\\b${team}\\b`);
        newName = newName.replace(reg, `TEAM${index}`);
      }
    });
    if (item != newName) {
      OD[newName] = OD[item];
      delete OD[item];
    }
  }

  return OD;
}

setInterval(() => {
  bet365STAT.sort((a, b) => {
    return b.count - a.count;
  });
  sportsBet365STAT.sort((a, b) => {
    return a.count - b.count;
  });
  sportsBet365STAT.reverse();
  console.log("Bet365:");
  console.table(bet365STAT);
  console.log("SportsBet:");
  console.table(sportsBet365STAT);

  let resStr = "";
  resStr += "\t\tSportsBet:\n\n"
  sportsBet365STAT.forEach(i=>{
    resStr += `${i.name}\tCOUNT: ${i.count}\n`
  })
  resStr += "\n\t\tBet365:\n\n"
  bet365STAT.forEach(i=>{
    resStr += `${i.name}\tCOUNT: ${i.count}\n`
  })
  fs.writeFileSync(__dirname + '/stat.txt', resStr);
}, 60000);
