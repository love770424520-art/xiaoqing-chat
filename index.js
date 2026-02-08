import express from "express";

const app = express();
app.use(express.json());

// 讀 Railway 變數（你已經在 Railway Variables 加好了）
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// Railway 健康檢查：打開網址會看到這句
app.get("/", (req, res) => {
  res.status(200).send("小晴已上線 💖");
});

// LINE Webhook：LINE 會 POST 這個路徑
app.post("/webhook", async (req, res) => {
  try {
    // 先立刻回 200，避免 LINE timeout
    res.sendStatus(200);

    const event = req.body?.events?.[0];
    if (!event || event.type !== "message" || event.message?.type !== "text") {
      return;
    }

    const replyToken = event.replyToken;
    const userText = event.message.text;

    // 沒 token 就直接記錄（方便你在 Railway Logs 看）
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.log("❌ 沒有讀到 LINE_CHANNEL_ACCESS_TOKEN（Railway Variables 沒設定或沒套用）");
      return;
    }

    const payload = {
      replyToken,
      messages: [{ type: "text", text: `小晴收到你說的：「${userText}」💖` }],
    };

    const r = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const t = await r.text();
    console.log("✅ 回覆結果", r.status, t);
  } catch (e) {
    console.log("❌ webhook error:", e);
  }
});

// Railway 會給 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});
