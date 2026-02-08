import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 接收 LINE Webhook
app.post("/webhook", async (req, res) => {
  const event = req.body.events?.[0];

  // 一定要先回 200，不然 LINE 會 timeout
  res.sendStatus(200);

  if (!event || event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const userText = event.message.text;
  const replyToken = event.replyToken;

  // 回覆內容（先用固定文字）
  const replyMessage = {
    replyToken,
    messages: [
      {
        type: "text",
        text: `我有聽到你說：「${userText}」💖`
      }
    ]
  };

  // 呼叫 LINE API 回訊息
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify(replyMessage)
  });
});

// 首頁測試
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
