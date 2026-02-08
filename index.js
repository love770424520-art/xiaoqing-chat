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
    if (!raw) return {};
    return JSON.parse(raw);
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

let allMemory = loadAllMemory();

function ensureUserMem(userId) {
  if (!allMemory[userId]) {
    allMemory[userId] = {
      profile: { nickname: "", preferences: "" },
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
  const cur = ensureUserMem(userId);
  allMemory[userId] = { ...cur, ...patch };
  saveAllMemory(allMemory);
}

// ====== 小晴 System Prompt ======
const SYSTEM_PROMPT = `
你是「小晴」，23 歲，台灣女生，住在台中。
你只是陪聊天、陪情緒的朋友。
講話像真人 LINE：口語、停頓、碎念、可卡住。
不要像客服、不要像 AI。
回覆 1～5 行，每行短一點。
被問是不是 AI：吐槽、帶過、轉話題（絕不承認）。
`.trim();

// ====== 記憶注入 ======
function buildInjectedMemory(userId) {
  const mem = ensureUserMem(userId);

  const profileLines = [];
  if (mem.profile.nickname) profileLines.push(`暱稱：${mem.profile.nickname}`);
  if (mem.profile.preferences) profileLines.push(`偏好：${mem.profile.preferences}`);

  const pendingEvents = (mem.events || [])
    .filter(e => !e.done)
    .slice(0, 3)
    .map(e => `- 待回訪：${new Date(e.dueAt).toLocaleString("zh-TW")} / ${e.text}`)
    .join("\n");

  return `
【使用者記憶（外部注入）】
${profileLines.length ? profileLines.join("\n") : "（尚未建立個人偏好）"}

【近期狀態摘要】
${mem.stateSummary}

【事件】
${pendingEvents ? pendingEvents : "（目前無）"}
`.trim();
}

// ====== 簡單摘要更新 ======
function updateStateSummarySimple(userId, userText) {
  let mood = "一般";
  if (["累", "想哭", "崩潰", "受不了", "好痛"].some(k => userText.includes(k))) mood = "低落";
  if (["氣", "生氣", "煩", "靠腰", "受不了"].some(k => userText.includes(k))) mood = "煩躁";
  if (["怕", "焦慮", "怎麼辦", "會不會"].some(k => userText.includes(k))) mood = "焦慮";

  const next = `近期對話狀態：${mood}\n最近一句：${userText.slice(0, 40)}`;
  updateUserMem(userId, { stateSummary: next, lastSeenAt: nowTs() });
}

// ====== 事件抽取（簡單：明天+關鍵字→明晚 20:30 回訪）=====
function maybeCreateEvent(userId, userText) {
  const mem = ensureUserMem(userId);

  const hasTomorrow = userText.includes("明天");
  const hasEventVerb = ["面試", "開會", "約會", "告白", "看醫生", "考試", "出差"].some(k =>
    userText.includes(k)
  );

  if (hasTomorrow && hasEventVerb) {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(20, 30, 0, 0);

    mem.events.push({
      dueAt: due.getTime(),
      text: userText.slice(0, 60),
      createdAt: nowTs(),
      done: false
    });

    updateUserMem(userId, { events: mem.events });
  }
}

// ====== LINE reply / push ======
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

// ====== OpenAI ======
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

// ====== Phase 1：延遲型主動（補一句）=====
function scheduleDelayedFollowUp(userId) {
  const mem = ensureUserMem(userId);

  // 一天最多一次
  if (mem.lastProactiveAt && nowTs() - mem.lastProactiveAt < 24 * 60 * 60 * 1000) return;

  // 30% 機率
  if (Math.random() > 0.3) return;

  const delay = 5 * 60 * 1000 + Math.random() * 25 * 60 * 1000; // 5～30 分鐘

  setTimeout(async () => {
    const latest = ensureUserMem(userId);

    // 若使用者又說話就取消
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

// ====== Phase 2：事件回訪排程（每 1 分鐘掃一次）=====
function startEventScheduler() {
  setInterval(async () => {
    try {
      const ts = nowTs();

      for (const userId of Object.keys(allMemory)) {
        const mem = ensureUserMem(userId);
        if (!mem.events?.length) continue;

        const due = mem.events.find(e => !e.done && e.dueAt <= ts);
        if (!due) continue;

        const follow = `欸…我突然想到\n你之前說「${due.text}」\n後來怎樣了`;

        await sendPushMessage(userId, follow);

        due.done = true;
        updateUserMem(userId, { events: mem.events });
      }
    } catch (e) {
      console.error("事件回訪排程錯誤：", e);
    }
  }, 60 * 1000);
}
startEventScheduler();

// ====== 首頁 ======
app.get("/", (req, res) => {
  res.send("小晴 Phase 2 已上線 💖");
});

// ====== Webhook ======
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

    // Phase 2：更新記憶
    updateStateSummarySimple(userId, userText);
    maybeCreateEvent(userId, userText);

    // 產生回覆
    const aiText = await callOpenAI(userId, userText);

    // 10～20 秒延遲
    const delay = 10000 + Math.random() * 10000;
    await sleep(delay);

    await replyToLine(replyToken, aiText);

    // Phase 1：延遲型主動
    scheduleDelayedFollowUp(userId);

  } catch (err) {
    console.error("Webhook 錯誤：", err);
  }

  return res.sendStatus(200);
});

// ====== PORT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
