const express = require("express");

const app = express();

app.use(express.json());

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req,res)=>{
    res.send("Welcome to HireSmart AI");
});

module.exports = app;