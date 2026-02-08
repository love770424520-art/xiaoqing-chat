import express from "express";

const app = express();
app.use(express.json());

// ✅ LINE Webhook 接收門
app.post("/webhook", (req, res) => {
  console.log("收到 LINE 訊息：", JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

// ✅ 首頁（你現在看到的小晴已上線）
app.get("/", (req, res) => {
  res.send("小晴已上線 💖");
});

// Railway 會給 PORT，沒有就用 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
