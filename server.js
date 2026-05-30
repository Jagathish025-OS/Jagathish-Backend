const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

app.get("/", (req, res) => {
    res.json({
        message: "Jagathish Backend Running"
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        version: "1.0",
        service: "Jagathish Backend"
    });
});

app.get("/api/files", async (req, res) => {

    const userFolder =
    "1131e565-e5de-4795-a3d8-955a26bbbe58";

    const { data, error } =
    await supabase.storage
    .from("files")
    .list(userFolder);

    if (error) {
        return res.status(500).json({
            error: error.message
        });
    }

    res.json(data);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server Running");
});
