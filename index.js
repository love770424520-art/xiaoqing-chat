import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ✅ 從 Railway 變數拿 LINE token（你已經在 Railway 設好了）
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ✅ LINE Webhook 接收（一定要是 /webhook）
app.post("/webhook", async (req, res) => {
  console.log("收到 LINE 訊息：", JSON.stringify(req.body, null, 2));

  const event = req.body?.events?.[0];

  // LINE 會送很多種類事件，非文字訊息就直接回 200
  if (!event || event.type !== "message" || event.message.type !== "text") {
    return res.sendStatus(200);
  }

  const replyToken = event.replyToken;
  const userText = event.message.text;

  const replyMessage = {
    replyToken,
    messages: [
      {
        type: "text",
        text: `小晴收到你說的：「${userText}」💖`,
      },
    ],
  };

  try {
    const r = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify(replyMessage),
    });

    const t = await r.text();
    console.log("LINE reply status:", r.status, t);
  } catch (e) {
    console.log("Reply error:", e);
  }

  // ✅ 一定要回 200，LINE 才會覺得成功
  res.sendStatus(200);
});

// ✅ 首頁（你用瀏覽器打開 Railway 網址會看到這句，代表服務活著）
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

// ✅ Railway 會給 PORT，不能寫死 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
