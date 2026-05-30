const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Server Running"
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        version: "1.0",
        service: "Jagathish Backend"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server Running");
});
