import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/", (req, res) => {
  res.send("xiaoqing-chat is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const userMessage = (req.body?.message || "").toString().trim();
    if (!userMessage) {
      return res.status(400).json({ error: "Missing message" });
    }

    const payload = {
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "你是23歲台灣女生小晴，講話像Line聊天，口語、會斷句、會用啦欸齁，帶一點毒舌但其實很暖，不說教。"
        },
        { role: "user", content: userMessage }
      ],
      temperature: 0.85
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    const repl
