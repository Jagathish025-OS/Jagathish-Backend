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

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY EXISTS =", !!process.env.SUPABASE_KEY);

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
    try {

        const { data, error } =
        await supabase.storage
        .from("files")
        .list();

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json(data);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }
});

app.get("/api/files/:userid", async (req, res) => {

    try {

        const userId = req.params.userid;

        const { data, error } =
        await supabase.storage
        .from("files")
        .list(userId);

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json(data);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server Running On Port ${PORT}`);
});
