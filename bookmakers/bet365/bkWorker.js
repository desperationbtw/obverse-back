const axios = require("axios"),
  config = require("../../config"),
  errorHandler = require("../../errorHandler");

const client = axios.create({
  baseURL: "https://bet365-sports-odds.p.rapidapi.com/v1/bet365",
  headers: {
    "x-rapidapi-key": "db56ae171dmsh02d9de2b3cf1318p164fddjsnc8ee2c8e83b3",
    "x-rapidapi-host": "bet365-sports-odds.p.rapidapi.com",
  },
});

var convertOdd = (value) => Number(eval(value) + 1).toFixed(2);

var parseTeams = (name) =>
  name.split(/(\b v \b)|(\b vs \b)|(\b @ \b)/gm).filter((i) => {
    if (i != null && i != " v " && i != " vs " && i != " @ " && i != " & ")
      return i;
  });

var parseEventName = (name) =>
  name.replace(
    /(^| ).(( ).)*( |$)|(\b\/\b)|(\b \b)|(\b, \b)|(\b,\b)|(\b ,\b)|(\b-\b)/gu,
    ""
  );

async function inplayChecker(currentEvents, updatedEvents) {
  let start = [],
    end = [];

  currentEvents.forEach((element) => {
    if (!~updatedEvents.indexOf(element)) end.push(element);
  });

  updatedEvents.forEach((element) => {
    if (!~currentEvents.indexOf(element)) start.push(element);
  });

  return { start: start, end: end };
}

module.exports = class {
  constructor(io) {
    this.io = io;
    this.events = [];
  }

  async worker(callback) {
    setInterval(async () => {
      let updatedEvents = await this.getInplayEvents();
      let { start, end } = await inplayChecker(
        this.events.map((item) => {
          return item.ID;
        }),
        updatedEvents.map((item) => {
          return item.ID;
        })
      );
      this.events = updatedEvents;

      start.forEach((item) =>
        this.updateEventOdds(
          this.events.find((i) => i.ID == item),
          callback
        )
      );
    }, 60000);
  }

  async updateEventOdds(event, callback) {
    let interval = setInterval(async () => {
      let eventInArray = this.events[this.events.indexOf(event)];
      if (eventInArray == null || eventInArray == undefined) {
        callback("Bet365", "Close", event.ID);
        clearInterval(interval);
        return;
      }

      let updatedOdds = await this.getEventOdds(event);
      if (JSON.stringify(eventInArray.OD) != JSON.stringify(updatedOdds)) {
        try {
          this.events[this.events.indexOf(eventInArray)].OD = updatedOdds;
          if (
            config.ACCEPTED_SPORTS.includes(
              this.events[this.events.indexOf(eventInArray)].SP
            )
          ) {
            callback(
              "Bet365",
              "Event",
              this.events[this.events.indexOf(eventInArray)]
            );
          }
        } catch (err) {
          errorHandler.rest(err);
        }
      }
    }, 5000);
  }

  async getEventOdds(event) {
    let result = {};
    await client
      .get("/event", {
        params: {
          raw: 0,
          FI: String(event.ID),
        },
      })
      .then((res) => {
        if (res.data.error) return;
        res = res.data.results[0];
        let currentTitle = "";
        let prefix = "";
        res.forEach((item) => {
          if (item.type == "MG") {
            currentTitle = item.NA;
            result[currentTitle] = {};
          }
          if (item.type == "MA") {
            if (item.NA == " " || item.NA === undefined) prefix = "";
            else prefix = `${item.NA} `;
          }
          if (item.type == "PA") {
            if (!item.OD) return;
            let ct = result[currentTitle];
            if (
              item.NA === undefined &&
              item.HA === undefined &&
              prefix[prefix.length - 1] == " "
            )
              prefix = prefix.substring(0, prefix.length - 1);
            let name = `${prefix}${item.NA ? item.NA : item.HA ? item.HA : ""}`;
            ct[name] = Number(convertOdd(item.OD));
          }
        });
      })
      .catch((err) => {
        errorHandler.rest(err);
      });
    return result;
  }

  async getInplayEvents() {
    let eventsArray = [];
    await client
      .get("/inplay", {
        params: {
          raw: 0,
        },
      })
      .then((res) => {
        res = res.data.results[0];
        let currentSport = "";
        res.forEach((element) => {
          if (element.type == "CL") currentSport = element.NA;
          if (element.type == "EV")
            eventsArray.push({
              BK: "Bet365",
              NA: element.NA,
              UL: `https://www.bet365.com/#/IP/EV${
                element.ID.toUpperCase().split("A")[0]
              }`,
              TM: parseTeams(element.NA),
              NF: parseEventName(element.NA),
              SP: currentSport,
              ID: element.ID,
              OD: [],
            });
        });
      })
      .catch((err) => {
        errorHandler.rest(err);
      });
    return eventsArray;
  }
};
