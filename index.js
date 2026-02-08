import express from "express";

const app = express();
app.use(express.json());

// LINE Token（從 Railway Variables 來）
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 首頁測試用
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

// LINE Webhook
app.post("/webhook", async (req, res) => {
  try {
    console.log("收到 LINE 訊息：", JSON.stringify(req.body, null, 2));

    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const replyToken = event.replyToken;
    const userText = event.message.text;

    const replyMessage = {
      replyToken,
      messages: [
        {
          type: "text",
          text: `小晴收到你說的：「${userText}」💖`
        }
      ]
    };

    const r = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify(replyMessage)
    });

    const t = await r.text();
    console.log("LINE 回覆結果：", r.status, t);
  } catch (err) {
    console.error("錯誤：", err);
  }

  res.sendStatus(200);
});

// Railway 指定 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
