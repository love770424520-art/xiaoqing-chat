import express from "express";


const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 接收 LINE Webhook
app.post("/webhook", async (req, res) => {
  console.log("收到 LINE 訊息：", JSON.stringify(req.body, null, 2));

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") {
    return res.sendStatus(200);
  }

  const replyToken = event.replyToken;
  const userText = event.message.text;

  const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const replyMessage = {
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
        "Authorization": `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify(replyMessage)
    });

    const t = await r.text();
    console.log("LINE reply status:", r.status, t);
  } catch (e) {
    console.log("Reply error:", e);
  }

  res.sendStatus(200);
});
