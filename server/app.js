const express = require("express");

const app = express();

const PORT = 5000;

app.get("/", (req, res) => {
    res.send("Welcome to HireSmart AI");
});

app.get("/about", (req, res) => {
    res.send("About HireSmart AI");
});

app.get("/jobs", (req, res) => {
    res.send("List of Jobs");
});

app.get("/login", (req, res) => {
    res.send("Login Page");
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});