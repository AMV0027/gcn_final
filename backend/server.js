const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();

const corsOptions = {
  origin: "*", // Allow all origins (update for security in production)
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders:
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new Client({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "gcn",
  password: process.env.DB_PASSWORD || "12345",
  port: process.env.DB_PORT || 5432,
});

// Connect to Database and create tables if needed
async function connectDB() {
  try {
    await db.connect();
    console.log("Connected to PostgreSQL");

    await db.query("BEGIN"); // Start a transaction

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        query TEXT NOT NULL,
        answer TEXT NOT NULL,
        pdf_references JSONB DEFAULT '[]',
        similar_images JSONB DEFAULT '[]',
        online_images JSONB DEFAULT '[]',
        online_videos JSONB DEFAULT '[]',
        online_links JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query("COMMIT"); // Commit the transaction
    console.log("Database tables ensured.");
  } catch (error) {
    await db.query("ROLLBACK"); // Rollback in case of error
    console.error("Database connection error:", error);
    process.exit(1);
  }
}

// Query Endpoint
app.post("/api/query", async (req, res) => {
  try {
    const { query, chatId } = req.body;
    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    console.log("Query payload received:", query);

    // Call external Python API
    const response = await axios.post("http://0.0.0.0:8000/api/query", {
      query,
    });

    if (!response.data || !response.data.answer) {
      return res.status(500).json({ message: "Invalid response from API" });
    }

    const data = response.data;
    console.log("API Response Data:", data);

    // Ensure all expected fields are safely handled
    const sanitizedData = {
      chat_id: chatId,
      query: data.query || query,
      answer: data.answer || "No answer available",
      pdf_references: JSON.stringify(data.pdf_references || []),
      similar_images: JSON.stringify(data.similar_images || []),
      online_images: JSON.stringify(data.online_images || []),
      online_videos: JSON.stringify(data.online_videos || []),
      online_links: JSON.stringify(data.online_links || []), // ✅ Ensured handling
    };

    // Insert data into chat_history table
    await db.query(
      `INSERT INTO chat_history 
      (chat_id, query, answer, pdf_references, similar_images, online_images, online_videos, online_links) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sanitizedData.chat_id,
        sanitizedData.query,
        sanitizedData.answer,
        sanitizedData.pdf_references,
        sanitizedData.similar_images,
        sanitizedData.online_images,
        sanitizedData.online_videos,
        sanitizedData.online_links,
      ]
    );

    res.json(data);
  } catch (error) {
    console.error("Error in /api/query:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Fetch distinct chat list
app.get("/api/chat-list", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (chat_id) chat_id, query, answer, pdf_references, similar_images, online_images, online_videos, online_links, created_at
      FROM chat_history ORDER BY chat_id, created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error retrieving chat list:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Signup Route
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const userExists = await db.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (userExists.rows.length)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username, email, hashedPassword]
    );
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login Route
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ message: "Username and password required" });

    const user = (
      await db.query("SELECT * FROM users WHERE username = $1", [username])
    ).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", userId: user.id });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Fetch chat history for a specific chatId
app.get("/api/chat-history/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    if (!chatId) {
      return res.status(400).json({ message: "Chat ID is required" });
    }

    const result = await db.query(
      `SELECT * FROM chat_history WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error retrieving chat history:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.post("/api/metadata", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  try {
    const metadata = await getMetaData(url);
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

app.get("/api/pdf", async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: "PDF name is required" });
  }

  try {
    const result = await db.query(
      "SELECT pdf_file FROM pdfdata WHERE pdf_name = $1",
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "PDF not found" });
    }

    const pdfBuffer = result.rows[0].pdf_file;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${name}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error retrieving PDF:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.delete("/api/chat", async (req, res) => {
  try {
    const { chatId } = req.query;

    if (!chatId) {
      return res.status(400).json({ message: "Chat ID is required" });
    }

    // Delete chat history for the specified chat ID
    const result = await db.query(
      "DELETE FROM chat_history WHERE chat_id = $1",
      [chatId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
connectDB().then(() =>
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
);
