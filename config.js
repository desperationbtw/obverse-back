const dotenv = require("dotenv");
const path = require("path");

const root = path.join.bind(this, __dirname);
dotenv.config({
  path: root(".env"),
});

module.exports = {
  IS_DEVELOPING: process.env.IS_DEV,
  PORT: process.env.PORT,
  MONGO_URL: process.env.MONGO_PATH,
  ACCEPTED_SPORTS: [
    "Table Tennis",
    "Tennis",
    "Soccer",
    "Baseball",
    "Cricket",
    "Darts",
    "Australian Rules",
  ],
};
