const app = require("./app");

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "127.0.0.1";

const server = app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
