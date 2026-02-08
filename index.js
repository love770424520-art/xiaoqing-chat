import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ====== LINE 金鑰（從 Railway 變數讀）======
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ====== 測試首頁（網址打開會看到）======
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

// ====== LINE Webhook 接收 ======
app.post("/webhook", async (req, res) => {
  console.log("收到 LINE webhook：", JSON.stringify(req.body, null, 2));

  const event = req.body?.events?.[0];
  if (!event || event.type !== "message") {
    return res.sendStatus(200);
  }

  const replyToken = event.replyToken;
  const userText = event.message.text;

  const replyBody = {
    replyToken,
    messages: [
      {
        type: "text",
        text: `小晴收到你說的：「${userText}」💖`
      }
    ]
  };

  try {
    const r = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(replyBody)
    });

    console.log("LINE 回傳狀態:", r.status);
  } catch (err) {
    console.error("回覆失敗:", err);
  }

  res.sendStatus(200);
});

// ====== Railway 一定要用 PORT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
