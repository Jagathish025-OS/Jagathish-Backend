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

/* -------------------- HOME -------------------- */

app.get("/", (req, res) => {
    res.json({
        message: "Jagathish Backend Running"
    });
});

/* -------------------- STATUS -------------------- */

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        version: "1.0",
        service: "Jagathish Backend"
    });
});

/* -------------------- STORAGE ROOT LIST -------------------- */

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

/* -------------------- USER FILES -------------------- */

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

/* -------------------- SAVE FILE METADATA -------------------- */

app.post("/api/save-file", async (req, res) => {

    try {

        const {
    user_id,
    filename,
    size,
    storage_path
} = req.body;

        const { data, error } =
        await supabase
        .from("files_metadata")
        .insert([
            {
    user_id,
    filename,
    size,
    storage_path,
    synced:false
            }
        ])
        .select();

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json({
            success: true,
            data
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

/* -------------------- USER METADATA -------------------- */

app.get("/api/metadata/:userid", async (req, res) => {

    try {

        const { data, error } =
        await supabase
        .from("files_metadata")
        .select("*")
        .eq("user_id", req.params.userid);

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

/* -------------------- PENDING FILES -------------------- */

app.get("/api/pending-files", async (req, res) => {

    try {

        const { data, error } =
        await supabase
        .from("files_metadata")
        .select("*")
        .eq("synced", false);

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

/* -------------------- MARK FILE SYNCED -------------------- */

app.post("/api/mark-synced/:id", async (req, res) => {

    try {

        const { local_path } = req.body;

        const { data, error } =
        await supabase
        .from("files_metadata")
        .update({
            synced: true,
            local_path: local_path,
            synced_at: new Date().toISOString()
        })
        .eq("id", req.params.id)
        .select();

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json({
            success: true,
            data
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

/* -------------------- START SERVER -------------------- */

const PORT = process.env.PORT || 3000;

app.get("/api/download-url/:id", async (req, res) => {

    const { data, error } =
    await supabase
    .from("files_metadata")
    .select("*")
    .eq("id", req.params.id)
    .single();

    if (error) {
        return res.status(500).json({
            error:error.message
        });
    }

    const { data:urlData } =
    supabase.storage
    .from("files")
    .getPublicUrl(data.storage_path);

    res.json({
        filename:data.filename,
        url:urlData.publicUrl
    });

});

app.listen(PORT, () => {
    console.log(`Server Running On Port ${PORT}`);
});
