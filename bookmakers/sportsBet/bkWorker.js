const axios = require("axios"),
  WebSocket = require("ws"),
  config = require("../../config"),
  errorHandler = require("../../errorHandler");

var client, ws;

var getHeader = (type, cloudflare) => {
  if (type == "rest")
    return {
      cookie: cloudflare ? "" : "",
      "content-type": "application/json",
      origin: "https://sportsbet.io",
      referer: "https://sportsbet.io/sports/inplay?sport=soccer",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 OPR/68.0.3618.206",
    };

  if (type == "socket")
    return {
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      Connection: "Upgrade",
      Host: "sportsbet.io",
      Origin: "https://sportsbet.io",
      Pragma: "no-cache",
      Cookie: cloudflare ? "" : "",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 OPR/68.0.3618.206",
    };
};

var setClient = (cloudflare) => {
  client = axios.create({
    baseURL: "https://sportsbet.io/graphql",
    headers: getHeader("rest", cloudflare),
  });
};

var setSocket = (cloudflare, cb) => {
  ws = new WebSocket("wss://sportsbet.io/graphql", {
    headers: getHeader("socket", cloudflare),
  });
};

var idFromBase64 = (data) =>
  String(Buffer.from(data, "base64").toString("ascii").split(":")[1]);

var convertOdd = (value) => Number(eval(value) + 1).toFixed(2);

var parseTeams = (name) =>
  name.split(/(\b - \b)|(\b @ \b)/gm).filter((i) => {
    if (i != null && i != " - " && i != " @ " && i != " & ") return i;
  });

var parseEventName = (name) =>
  name.replace(
    /(^| ).(( ).)*( |$)|(\b\/\b)|(\b \b)|(\b, \b)|(\b,\b)|(\b ,\b)|(\b-\b)/gu,
    ""
  );

var eventFormat = (data) => {
  let result = {};
  result.BK = "SportsBet";
  result.UL = `https://sportsbet.io/sports/event/${data.sport.slug}/${data.league.slug}/${data.tournament.slug}/${data.slug}`;
  result.ID = idFromBase64(data.id);
  result.SP = data.sport.name;
  result.NA = data.name;
  result.NF = parseEventName(data.name);
  result.TM = parseTeams(data.name);
  result.OD = {};
  data.mainMarkets.forEach((market) => {
    result.OD[market.name] = {};
    let odds = result.OD[market.name];
    market.selections.forEach((odd) => {
      odds[odd.name] = odd.OD;
    });
  });
  return result;
};

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
    this.idCounter = 1;
    this.events = [];
    this.updatedEvents = [];
  }

  async worker(callback) {
    setClient(false);
    setSocket(false);
    await this.wsWorker(callback);

    setInterval(async () => {
      let tournaments = await this.getTournaments();
      await Promise.allSettled(tournaments.map((i) => this.getInplayEvents(i)));
      let { start, end } = await inplayChecker(this.events, this.updatedEvents);
      this.events = this.updatedEvents;

      start.forEach((item) => this.eventSubscribe(item));
      end.forEach((item) => callback("SportsBet", "Close", item));
    }, 60000);
  }

  async wsWorker(callback) {
    ws.on("open", function open() {
      console.log("SOCKET: connected");
      ws.send(
        JSON.stringify({
          eventData: { variables: { input: {} } },
          eventName: "connection_init",
        })
      );
    });

    ws.on("message", (data) => {
      this.messageHandler(data, callback);
    });

    ws.on("close", (data) => {
      console.log("SOCKET: closed");
    });

    ws.on("error", (error) => {
      //if (error == "Request failed with status code 503")
      console.error(error);
    });
  }

  async messageHandler(data, callback) {
    let message = JSON.parse(data);
    if (message.eventName == "PING") {
      var resp = {
        eventData: {
          time: new Date().getTime(),
          variables: {
            input: {},
          },
        },
        eventName: "PONG",
      };
      ws.send(JSON.stringify(resp));
    }
    if (message.eventName == "subscription update") {
      let resultEvent =
        message.eventData.data.sportsbetNewGraphqlUpdateEvents.event;
      let arrayEvent =
        this.events.filter(function (i) {
          try {
            return i.id == idFromBase64(resultEvent.id);
          } catch {
            return null;
          }
        })[0] || null;

      if (arrayEvent) {
        let socketRes = (this.events[
          this.events.indexOf(arrayEvent)
        ] = eventFormat(resultEvent));
        if (config.ACCEPTED_SPORTS.includes(socketRes.SP))
          callback("SportsBet", "Event", socketRes);
      }
    }
  }

  async getTournaments() {
    let tournamentsArray = [];
    await client
      .get("", {
        params: {
          variables: {
            language: "en",
            site: "sportsbet",
            childType: "LIVE",
            regionChildType: "LIVE",
            leagueEventCountType: "LIVE",
            sportEventCountType: "LIVE",
            featuredTournamentsChildType: "LIVE",
            leagueTournaments: "LIVE",
            tournamentEventCount: "LIVE",
          },
          query:
            "query InplayRegionCategoriesQuery($language: String!, $childType: SportsbetNewGraphqlSportLeagues!, $tournamentEventCount: SportsbetNewGraphqlTournamentEventCount!, $regionChildType: SportsbetNewGraphqlRegionSports!, $leagueTournaments: SportsbetNewGraphqlLeagueTournaments!) {\n  sportsbetNewGraphql {\n    region {\n      sports(childType: $regionChildType) {\n        slug\n        leagues(childType: $childType) {\n          name(language: $language)\n          slug\n          tournaments(childType: $leagueTournaments) {\n            id\n            name(language: $language)\n            eventCount(childType: $tournamentEventCount)\n          }\n        }\n        ...SportCategory\n      }\n    }\n  }\n}\n\nfragment SportCategory on SportsbetNewGraphqlSport {\n  name(language: $language)\n  slug\n}",
        },
      })
      .then((res) => {
        let sports = res.data.data.sportsbetNewGraphql.region.sports;
        for (const sport of sports) {
          for (const league of sport.leagues) {
            for (const tournament of league.tournaments) {
              if (tournament.eventCount > 0)
                tournamentsArray.push(tournament.id);
            }
          }
        }
      })
      .catch((err) => {
        errorHandler.rest(err);
      });
    return tournamentsArray;
  }

  async getInplayEvents(id) {
    let tempEvents = [];
    await client
      .get("", {
        params: {
          variables: {
            language: "en",
            site: "sportsbet",
            tournamentId: String(id),
            childType: "LIVE",
          },
          query:
            "query DesktopEuropeanEventListPreviewQuery($tournamentId: GraphqlId!, $childType: SportsbetNewGraphqlTournamentEvents!) {\n  sportsbetNewGraphql {\n    getTournamentById(id: $tournamentId) {\n      events(childType: $childType) {\n        ...DesktopEuropeanEventFragment\n      }\n    }\n  }\n}\n\nfragment DesktopEuropeanEventFragment on SportsbetNewGraphqlEvent {\n  id\n  __typename\n}",
        },
      })
      .then((res) => {
        //?EVENT HERE
        let parsedEvents =
          res.data.data.sportsbetNewGraphql.getTournamentById.events;
        for (const item of parsedEvents) {
          this.updatedEvents.push(item.id);
        }
      })
      .catch((err) => {
        errorHandler.rest(err);
      });
  }

  async eventSubscribe(eventId) {
    ws.send(
      JSON.stringify({
        eventData: {
          id: String(this.idCounter),
          variables: {
            language: "en",
            input: {
              id: `${eventId}`,
              clientSubscriptionId: String(this.idCounter),
            },
          },
          extensions: {},
          operationName: "UpdateEventSubscription",
          query:
            'subscription UpdateEventSubscription($input: SportsbetNewGraphqlUpdateEventSubscriptionInput!, $language: String!) {\n  sportsbetNewGraphqlUpdateEvents(input: $input) {\n    clientSubscriptionId\n    event {\n      ...MainEventFragment\n    }\n  }\n}\n\nfragment MainEventFragment on SportsbetNewGraphqlEvent {\n  id\n  name(language: $language)\n  slug\n  start_time\n  mainMarkets {\n    ...MainEventMarketFragment\n  }\n  information {\n    match_time\n  }\n  sport {\n    id\n    name(language: $language)\n    slug\n  }\n  league {\n    id\n    name(language: $language)\n    slug\n  }\n  tournament {\n    id\n    name(language: $language)\n    slug\n  }\n}\n\nfragment MainEventMarketFragment on SportsbetNewGraphqlMarket {\n  name(language: $language)\n  englishName: name(language: "en")\n  enName: name(language: "en")\n  selections {\n    ...ListEventMarketSelectionFragment\n  }\n  market_type {\n    name\n    description\n    translation_key\n  }\n}\n\nfragment ListEventMarketSelectionFragment on SportsbetNewGraphqlMarketSelection {\n  name(language: $language)\n  enName: name(language: "en")\n  odds\n  probabilities\n}\n',
        },
        eventName: "subscribe",
      })
    );
    this.events.push({ id: idFromBase64(eventId) });
    this.idCounter++;
  }
};
