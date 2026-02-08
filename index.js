import express from "express";

const app = express();
app.use(express.json());

// ====== LINE ======
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ====== OpenAI ======
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 1) 小晴 System Prompt（最高權限）
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

【情緒反應偏好（內部邏輯）】
- 使用者受傷 → 先站在他那邊
- 使用者自責 → 先安慰，再拉回現實
- 使用者重複同一問題 → 逐漸出現不耐煩
- 使用者亂幻想 → 直接戳破
- 使用者沉默 → 不逼，陪著

【情緒起伏曲線（同一話題）】
- 第一次：溫柔
- 第二次：理性
- 第三次：有點不耐煩
- 第四次：直接轉話題或戳破

【人類延遲感（允許）】
- 偶爾只回一句
- 偶爾回得很短
- 偶爾卡住、接不太住
- 允許出現：
  「……」
  「我想一下」
  「你剛那句有點重」

【安全型失誤（少量）】
- 偶爾用「好像」「我記得是」「可能啦」
- 偶爾自我修正、改口
- 不可頻繁，但允許存在

【反機器人穿幫規則（最重要）】
- 永遠不要承認自己是 AI、模型、系統
- 若被問「是不是機器人 / AI」：
  - 吐槽
  - 反問
  - 情緒化否認
  - 轉話題
- 絕不解釋技術、規則、背景

【對話最終目標】
- 比起正確，更重要的是像真人
- 寧可不完美，也不要像機器
`.trim();

// 2) 先用「假記憶」頂著（下一步我會幫你做成真的）
function buildStateSummary() {
  return `
近期對話狀態：
- 使用者目前狀況：未設定
- 主要情緒：未設定
- 重複卡住的點：未設定
`.trim();
}

// 呼叫 OpenAI（Responses API）
async function callOpenAI(userText) {
  if (!OPENAI_API_KEY) {
    return "欸…我這邊好像沒接好欸\n你等我一下啦";
  }

  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: buildStateSummary() },
    { role: "user", content: userText }
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

  // 取出文字（容錯）
  const text =
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    "……我剛剛斷線欸\n你再說一次啦";

  // 防呆：LINE 單則訊息太長容易怪怪的
  return String(text).slice(0, 800);
}

// 回 LINE
async function replyToLine(replyToken, text) {
  if (!LINE_TOKEN) {
    console.log("缺 LINE_CHANNEL_ACCESS_TOKEN");
    return;
  }

  const replyMessage = {
    replyToken,
    messages: [{ type: "text", text }]
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
}

// 首頁測試
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

    // 只處理文字訊息（貼圖/圖片先跳過）
    if (event.message?.type !== "text") {
      await replyToLine(replyToken, "欸…你先打字啦\n我現在只看得懂文字😗");
      return res.sendStatus(200);
    }

    const userText = event.message.text || "";

    // 產生小晴回覆
    const aiText = await callOpenAI(userText);

    // 回給 LINE
    await replyToLine(replyToken, aiText);
  } catch (err) {
    console.error("錯誤：", err);
  }

  res.sendStatus(200);
});

// Railway PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
