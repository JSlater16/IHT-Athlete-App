const app = require("./app");

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "127.0.0.1";

const server = app.listen(port, host, () =>