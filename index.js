import express from "express";
import fs from "fs";
import path from "path";

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

function nowTs() {
  return Date.now();
}

// ====== Phase 2A：檔案型記憶 ======
const MEMORY_FILE = path.join(process.cwd(), "memory.json");

function loadAllMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return {};
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("讀取 memory.json 失敗：", e);
    return {};
  }
}

function saveAllMemory(all) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(all, null, 2), "utf8");
  } catch (e) {
    console.error("寫入 memory.json 失敗：", e);
  }
}

// allMemory: { [userId]: { profile, stateSummary, events, lastSeenAt, lastProactiveAt } }
let allMemory = loadAllMemory();

function getUserMem(userId) {
  if (!allMemory[userId]) {
    allMemory[userId] = {
      profile: {
        nickname: "",
        preferences: ""
      },
      stateSummary: "近期對話狀態：一般",
      events: [], // { dueAt, text, createdAt, done }
      lastSeenAt: 0,
      lastProactiveAt: 0
    };
    saveAllMemory(allMemory);
  }
  return allMemory[userId];
}

function updateUserMem(userId, patch) {
  allMemory[userId] = { ...getUserMem(userId), ...patch };
  saveAllMemory(allMemory);
}

// ====== Phase 2：事件回訪排程（每 1 分鐘掃一次）=====
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

function startEventScheduler() {
  setInterval(async () => {
    try {
      const ts = nowTs();
      const userIds = Object.keys(allMemory);

      for (const userId of userIds) {
        const mem = getUserMem(userId);
        if (!mem.events?.length) continue;

        // 找到到期且未完成的事件（一次只推一個，避免吵）
        const due = mem.events.find(e => !e.done && e.dueAt <= ts);
        if (!due) continue;

        // 生成回訪訊息（固定短句，超像人）
        const follow = `欸…我突然想到\n你之前說「${due.text}」\n後來怎樣了`;

        await sendPushMessage(userId, follow);

        // 標記完成
        due.done = true;
        updateUserMem(userId, { events: mem.events });
      }
    } catch (e) {
      console.error("事件回訪排程錯誤：", e);
    }
  }, 60 * 1000);
}
startEventScheduler();

// ====== 小晴 System Prompt ======
const SYSTEM_PROMPT = `
你是「小晴」，23 歲，台灣女生，住在台中。
你只是陪聊天、陪情緒的朋友。
講話要像真人 LINE 聊天，有停頓、有碎念。
不要像客服、不要像 AI。

規則：
- 回覆 1～5 行
- 口語、碎念、可卡住
- 不要條列分析、不要長篇
- 被問是不是 AI：吐槽、帶過、轉話題（絕不承認）
`.trim();

// ====== 把外部記憶注入模型（這就是 Phase 2 的核心）=====
function buildInjectedMemory(userId) {
  const mem = getUserMem(userId);

  const profile = [
    mem.profile.nickname ? `暱稱：${mem.profile.nickname}` : "",
    mem.profile.preferences ? `偏好：${mem.profile.preferences}` : ""
  ].filter(Boolean).join("\n");

  const pendingEvents = (mem.events || [])
    .filter(e => !e.done)
    .slice(0, 3)
    .map(e => `- 待回訪：${new Date(e.dueAt).toLocaleString("zh-TW")} / ${e.text}`)
    .join("\n");

  return `
【使用者記憶（外部注入）】
${profile ? profile : "（尚未建立個人偏好）"}

【近期狀態摘要】
${mem.stateSummary}

${pendingEvents ? `【事件】\n${pendingEvents}` : "【事件】\n（目前無）"}
`.trim();
}

// ====== 把本回合內容「更新成摘要」(簡單版) ======
function updateStateSummarySimple(userId, userText) {
  // 先做最簡單：把近期狀態變成「最近一句 + 情緒猜測」
  // 之後你要更精準，我們再改成「用模型自動摘要」
  let mood = "一般";
  if (["累", "想哭", "崩潰", "受不了", "好痛"].some(k => userText.includes(k))) mood = "低落";
  if (["氣", "生氣", "煩", "靠腰", "受不了"].some(k => userText.includes(k))) mood = "煩躁";
  if (["怕", "焦慮", "怎麼辦", "會不會"].some(k => userText.includes(k))) mood = "焦慮";

  const mem = getUserMem(userId);
  const next = `近期對話狀態：${mood}\n最近一句：${userText.slice(0, 40)}`;
  updateUserMem(userId, { stateSummary: next, lastSeenAt: nowTs() });
}

// ====== 事件抽取（簡單規則版，先能用）=====
function maybeCreateEvent(userId, userText) {
  const mem = getUserMem(userId);

  // 明天 / 今天 / 下週…（先做最常用的：明天）
  // 你講「明天要面試 / 明天要告白」這種，我們就排明天 20:30 回訪
  const hasTomorrow = userText.includes("明天");
  const hasEventVerb = ["面試", "開會", "約會", "告白", "看醫生", "考試", "出差"].some(k => userText.includes(k));

  if (hasTomorrow && hasEventVerb) {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(20, 30, 0, 0); // 明天晚上 8:30 回訪（很像真人）

    mem.events.push({
      dueAt: due.getTime(),
      text: userText.slice(0, 60),
      createdAt: nowTs(),
      done: false
    });

    updateUserMem(userId, { events: mem.events });
  }
}

// ====== OpenAI（Responses API）=====
// OpenAI 官方建議用「把對話狀態帶在每次請求」來維持連貫:contentReference[oaicite:1]{index=1}
async function callOpenAI(userId, userText) {
  const injected = buildInjectedMemory(userId);

  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: injected },
    {
      role: "user",
      content: `（請先用一句情緒反應，再回內容）
使用者說：${userText}`.trim()
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
    "……我剛剛在想啦";

  return String(text).slice(0, 800);
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

// ====== Phase 1：延遲型主動（補一句）=====
function scheduleDelayedFollowUp(userId) {
  const mem = getUserMem(userId);

  // 一天最多一次主動補一句
  if (mem.lastProactiveAt && nowTs() - mem.lastProactiveAt < 24 * 60 * 60 * 1000) return;

  // 30% 機率
  if (Math.random() > 0.3) return;

  const delay = 5 * 60 * 1000 + Math.random() * 25 * 60 * 1000; // 5～30 分鐘

  setTimeout(async () => {
    const latest = getUserMem(userId);

    // 使用者又說話就取消
    if (nowTs() - latest.lastSeenAt < delay - 1000) return;

    const followUps = [
      "欸…我剛剛一直在想你那句",
      "突然想到你剛說的那個",
      "我可能想太多啦，但那句真的有點重",
      "剛剛本來要算了，但還是想說",
      "不知道為什麼，腦袋一直轉你那句"
    ];
    const text = followUps[Math.floor(Math.random() * followUps.length)];

    await sendPushMessage(userId, text);
    updateUserMem(userId, { lastProactiveAt: nowTs() });
  }, delay);
}

// ====== 首頁 ======
app.get("/", (req, res) => {
  res.send("小晴 Phase 2 已上線 💖");
});

// ====== LINE Webhook ======
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source?.userId;
    const replyToken = event.replyToken;

    if (event.message?.type !== "text") {
      await replyToLine(replyToken, "欸…你先打字啦😗");
      return res.sendStatus(200);
    }

    const userText = event.message.text || "";

    // Phase 2：更新記憶（摘要 + 事件）
    updateStateSummarySimple(userId, userText);
    maybeCreateEvent(userId, userText);

    // 產生 AI 回覆
    const aiText = await callOpenAI(userId, userText);

    // 真人回覆延遲：10～20 秒
    const delay = 10000 + Math.random() * 10000;
    await sleep(delay);

    // 正式回覆
    await replyToLine(replyToken, aiText);

    // Phase 1：延遲型主動（補一句）
    scheduleDelayedFollowUp(userId);

  } catch (err) {
    console.error("Webhook 錯誤：", err);
  }

  res.sendStatus(200);
});

// ====== PORT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
