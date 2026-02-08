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
      lastSeenAt:
