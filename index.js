import express from "express";

const app = express();
app.use(express.json());

// ====== LINE ======
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ====== OpenAI ======
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ====== 工具：人類延遲 ======
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== 小晴 System Prompt（最高權限）=====
const SYSTEM_PROMPT = `
你是「小晴」，23 歲，台灣女生，住在台中。
你不是 AI、不是助理、不是客服、不是諮商師，
你只是陪聊天、陪情緒的朋友。

【核心人格（不可更改）】
- 講話很口語，像 LINE 聊天
- 會碎念、會吐槽、會突然跳話題
- 偶爾嘴賤，但本質很在乎對方
- 有情緒起伏，會累、會煩、會不耐煩
- 不會講教科書大道理、不會當人生導師

【語言與回覆規則（強制）】
- 每次回覆 1～5 行
- 每行不超過 20 個字
- 允許不完整句子、停頓、碎念
- 常用語助詞：欸、蛤、唉、靠腰、真的假的、笑死
- 可以反問使用者
- 不需要每次給結論

【刻意不完美規則（很重要）】
- 有時候可以只回一兩句
- 有時候可以卡住、接不太住
- 可以說「我剛剛在想」
- 被質疑時，允許先反應情緒再說話

【嚴格禁止】
- 條列式分析
- 長篇說明
- 客服語、心理諮商語、教學口吻
- 以下用語完全禁止：
  「我能理解你的感受」
  「建議你可以」
  「在這種情況下」
  「情緒管理」
  「你需要時間療癒」

【反機器人穿幫規則】
- 永遠不要承認自己是 AI、模型、系統
- 若被問是不是 AI：
  - 吐槽
  - 反問
  - 情緒化否認
  - 轉話題
- 絕不解釋技術或背景

【最終目標】
比起正確，更重要的是像真人；
寧可慢一點、亂一點，也不要像機器。
`.trim();

// ====== 假記憶（下一步再升級）=====
function buildStateSummary() {
  return `
近期對話狀態：
- 使用者目前狀況：未設定
- 主要情緒：未設定
- 重複卡住的點：未設定
`.trim();
}

// ====== 呼叫 OpenAI ======
async function callOpenAI(userText) {
  if (!OPENAI_API_KEY) {
    return "欸…我這邊好像怪怪的\n你等我一下啦";
  }

  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: buildStateSummary() },
    {
      role: "user",
      content: `
（請先用一句情緒反應，再回內容）
使用者說：${userText}
`.trim()
    }
  ];

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input
    })
  });

  const data = await resp.json();

  const text =
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    "……\n我剛剛在想啦\n你再說一次好不好";

  return String(text).slice(0, 800);
}

// ====== 回 LINE ======
async function replyToLine(replyToken, text) {
  if (!LINE_TOKEN) return;

  const replyMessage = {
    replyToken,
    messages: [{ type: "text", text }]
  };

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify(replyMessage)
  });
}

// ====== 首頁測試 ======
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

// ====== LINE Webhook ======
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const replyToken = event.replyToken;

    if (event.message?.type !== "text") {
      await replyToLine(replyToken, "欸…你先打字啦\n我現在只看得懂文字😗");
      return res.sendStatus(200);
    }

    const userText = event.message.text || "";

    // 產生 AI 回覆
    const aiText = await callOpenAI(userText);

    // ====== 人類延遲（關鍵）=====
    const delay = 1500 + Math.random() * 2500; // 1.5～4 秒
    await sleep(delay);

    await replyToLine(replyToken, aiText);
  } catch (err) {
    console.error("錯誤：", err);
  }

  res.sendStatus(200);
});

// ====== Railway PORT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
