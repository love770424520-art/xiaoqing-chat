import express from "express";
import fs from "fs/promises";

const app = express();
app.use(express.json());

// 讀取 Railway 變數：如果它給的是「檔案路徑」，就去把檔案內容讀出來（Railway 有時會這樣）
async function readEnvOrFile(key) {
  const v = process.env[key];
  if (!v) return "";

  // 看起來像檔案路徑（例如 /tmp/.../secrets/XXX）
  if (v.startsWith("/") || v.includes("/secrets/")) {
    try {
      const txt = await fs.readFile(v, "utf-8");
      return (txt || "").trim();
    } catch {
      // 讀不到就直接回傳原本內容
      return v.trim();
    }
  }

  return v.trim();
}

// ✅ 首頁：你在瀏覽器貼 Railway 網址看到的那句
app.get("/", (req, res) => {
  res.status(200).send("小晴已上線 💖");
});

// ✅ LINE Webhook 接收門：LINE 會 POST 到這裡
app.post("/webhook", async (req, res) => {
  // 先立刻回 200，避免 LINE timeout
  res.sendStatus(200);

  try {
    console.log("收到 LINE Webhook：", JSON.stringify(req.body, null, 2));

    const events = req.body?.events || [];
    if (!events.length) return;

    const accessToken = await readEnvOrFile("LINE_CHANNEL_ACCESS_TOKEN");
    if (!accessToken) {
      console.log("❌ 缺少 LINE_CHANNEL_ACCESS_TOKEN（Railway Variables 沒設定好）");
      return;
    }

    // 只處理「文字訊息」
    for (const event of events) {
      if (event.type !== "message") continue;
      if (!event.message || event.message.type !== "text") continue;

      const replyToken = event.replyToken;
      const userText = event.message.text || "";

      const replyBody = {
        replyToken,
        messages: [
          {
            type: "text",
            text: `小晴收到你說的：「${userText}」💖`,
          },
        ],
      };

      const r = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(replyBody),
      });

      const t = await r.text();
      console.log("LINE reply result:", r.status, t);
    }
  } catch (e) {
    console.log("❌ webhook 處理失敗：", e);
  }
});

// ✅ Railway 會給你 PORT，不要自己寫死 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
