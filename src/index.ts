import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";

const app = new Hono();

// Supabase client with service role key
// (full database access, server-side only)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Allow requests from your GitHub Pages domain
app.use(
    "/*",
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        credentials: true,
    })
);

// --- Auth Middleware ---
app.use("/api/*", async (c, next) => {
    const header = c.req.header("Authorization");

    if (!header?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const token = header.split(" ")[1];

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
        return c.json({ error: "Invalid token" }, 401);
    }

    c.set("user" as never, data.user);
    await next();
});

// --- Routes ---

// Get all notes for the logged-in user
app.get("/api/notes", async (c) => {
    const user = c.get("user" as never) as any;

    const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        return c.json({ error: error.message }, 500);
    }

    return c.json(data);
});

// Create a new note
app.post("/api/notes", async (c) => {
    const user = c.get("user" as never) as any;
    const body = await c.req.json();

    const { data, error } = await supabase
        .from("notes")
        .insert({
            user_id: user.id,
            title: body.title || "Untitled",
            content: body.content || "",
        })
        .select()
        .single();

    if (error) {
        return c.json({ error: error.message }, 500);
    }

    return c.json(data, 201);
});

// Delete a note
app.delete("/api/notes/:id", async (c) => {
    const user = c.get("user" as never) as any;
    const noteId = c.req.param("id");

    const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", user.id);

    if (error) {
        return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Start server
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`Server running on port ${port}`);
serve({ fetch: app.fetch, port });