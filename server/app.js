const http = require("http");

const server = http.createServer((req, res) => {
  res.end("Welcome to HireSmart AI");
});

server.listen(5000, () => {
  console.log("Server is running on http://localhost:5000");
});