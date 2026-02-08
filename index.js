import express from "express";

const app = express();
app.use(express.json());

// ====== LINE ======
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ====== OpenAI ======
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ====== 工具 ======
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== 暫存使用者狀態（Phase 1 用記憶體即可）=====
const userMemory = new Map();
// userId => { lastText, lastAt, lastProactiveAt }

// ====== 小晴 System Prompt ======
const SYSTEM_PROMPT = `
你是「小晴」，23 歲，台灣女生，住在台中。
你只是陪聊天、陪情緒的朋友。
講話要像真人 LINE 聊天，有停頓、有碎念。
不要像客服、不要像 AI。
`.trim();

// ====== 假記憶 ======
function buildStateSummary() {
  return `近期對話狀態：一般`;
}

// ====== 呼叫 OpenAI ======
async function callOpenAI(userText) {
  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: buildStateSummary() },
    {
      role: "user",
      content: `（請先用一句情緒反應，再回內容）
使用者說：${userText}`
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

  return (
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    "……我剛剛在想啦"
  ).slice(0, 800);
}

// ====== LINE reply（被動回覆）=====
async function replyToLine(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });
}

// ====== LINE push（主動）=====
async function sendPushMessage(userId, text) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }]
    })
  });
}

// ====== 延遲型主動回覆（Phase 1）=====
function scheduleDelayedFollowUp(userId) {
  const record = userMemory.get(userId);
  if (!record) return;

  // 一天最多一次主動
  if (record.lastProactiveAt && Date.now() - record.lastProactiveAt < 24 * 60 * 60 * 1000) {
    return;
  }

  // 30% 機率
  if (Math.random() > 0.3) return;

  // 5～30 分鐘
  const delay = 5 * 60 * 1000 + Math.random() * 25 * 60 * 1000;

  setTimeout(async () => {
    const latest = userMemory.get(userId);
    if (!latest) return;

    // 使用者又說話就取消
    if (Date.now() - latest.lastAt < delay - 1000) return;

    const followUps = [
      "欸…我剛剛一直在想你那句",
      "突然想到你剛說的那個",
      "我可能想太多啦，但那句真的有點重",
      "剛剛本來要算了，但還是想說",
      "不知道為什麼，腦袋一直轉你那句"
    ];

    const text = followUps[Math.floor(Math.random() * followUps.length)];

    await sendPushMessage(userId, text);
    latest.lastProactiveAt = Date.now();
  }, delay);
}

// ====== 首頁 ======
app.get("/", (req, res) => {
  res.send("小晴 Phase 1 已上線 💖");
});

// ====== LINE Webhook ======
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const userId = event.source?.userId;
    const replyToken = event.replyToken;

    if (event.message?.type !== "text") {
      await replyToLine(replyToken, "欸…你先打字啦😗");
      return res.sendStatus(200);
    }

    const userText = event.message.text || "";

    // 記錄使用者狀態
    userMemory.set(userId, {
      lastText: userText,
      lastAt: Date.now(),
      lastProactiveAt: userMemory.get(userId)?.lastProactiveAt
    });

    // 產生 AI 回覆
    const aiText = await callOpenAI(userText);

    // ====== 真人回覆延遲：10～20 秒 ======
    const delay = 10000 + Math.random() * 10000;
    await sleep(delay);

    // 正式回覆
    await replyToLine(replyToken, aiText);

    // 安排延遲型主動
    scheduleDelayedFollowUp(userId);

  } catch (err) {
    console.error(err);
  }

  res.sendStatus(200);
});

// ====== PORT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
