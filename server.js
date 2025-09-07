const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const DATA_FILE = path.join(__dirname, "data.json");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Cấu hình multer để upload file vào bộ nhớ (không lưu ra ổ cứng)
const upload = multer({ storage: multer.memoryStorage() });

// Biến lưu trữ dữ liệu
let userData = [];

// Load dữ liệu từ file JSON khi server khởi động
function loadDataFromFile() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      if (raw.trim() === "") {
        userData = [];
      } else {
        userData = JSON.parse(raw);
      }
      console.log(`Đã load ${userData.length} records từ data.json`);
    } catch (err) {
      console.error("Lỗi đọc data.json:", err);
      userData = [];
    }
  }
}
loadDataFromFile();

app.get('', (req, res) => {
    res.sendFile('/index.html', { root: "public" });
});

// Routes
app.post("/upload-excel", upload.single("excelFile"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file được upload" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

    userData = jsonData.map((row, index) => ({
      id: index,
      ma: String(row["MÃ"] || row["MA"] || "").trim(),
      hoTen: row["HỌ VÀ TÊN"] || row["HO VA TEN"] || "",
      gioiTinh: row["GIỚI TÍNH"] || row["GIOI TINH"] || "",
      diaChi: row["ĐỊA CHỈ"] || row["DIA CHI"] || "",
      khoa: row["KHOA/PHÒNG"] || row["KHOA PHONG"] || row["KHOA"] || "",
      donVi: row["ĐƠN VỊ"] || row["DON VI"] || "",
      checkin: "Chưa vào",
      timestamp: null,
    }));

    // Ghi đè dữ liệu vào file JSON
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2), "utf8");

    // Broadcast dữ liệu mới cho tất cả client
    io.emit("dataUpdated", userData);

    res.json({
      success: true,
      data: userData,
      message: `Đã import ${userData.length} records`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/data", (req, res) => {
  res.json({ data: userData });
});

app.post("/checkin", (req, res) => {
  try {
    const { code } = req.body;
    const trimmedCode = String(code).trim();

    const person = userData.find((p) => String(p.ma).trim() === trimmedCode);

    if (person) {
      if (person.checkin === "Chưa vào") {
        person.checkin = "Đã vào";
        person.timestamp = new Date().toLocaleString("vi-VN");
        // Ghi đè lại file data.json
        fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2), "utf8");
        io.emit("dataUpdated", userData);
        return res.json({ success: true, person, data: userData });
      } else {
        return res.json({
          success: false,
          person,
          message: "Đã checkin trước đó",
        });
      }
    } else {
      return res.json({ success: false, message: "Không tìm thấy mã" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/export-excel", (req, res) => {
  try {
    const exportData = userData.map((person) => ({
      MÃ: person.ma,
      "HỌ VÀ TÊN": person.hoTen,
      "GIỚI TÍNH": person.gioiTinh,
      "ĐỊA CHỈ": person.diaChi,
      "KHOA/PHÒNG": person.khoa,
      "ĐƠN VỊ": person.donVi,
      CHECKIN: person.checkin,
      "THỜI GIAN": person.timestamp || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checkin Data");

    const now = new Date();
    const timestamp =
      now.getFullYear() +
      "-" +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      "-" +
      now.getDate().toString().padStart(2, "0") +
      "_" +
      now.getHours().toString().padStart(2, "0") +
      "-" +
      now.getMinutes().toString().padStart(2, "0");

    const filename = `checkin_data_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, filename);

    XLSX.writeFile(wb, filepath);

    res.download(filepath, filename, (err) => {
      if (err) {
        console.error(err);
      }
      // Xóa file sau khi download
      require("fs").unlinkSync(filepath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/edit-person", (req, res) => {
  try {
    const { ma, updated } = req.body;
    const idx = userData.findIndex(
      (p) => String(p.ma).trim() === String(ma).trim()
    );
    if (idx === -1)
      return res.json({ success: false, message: "Không tìm thấy mã" });
    userData[idx] = { ...userData[idx], ...updated };
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2), "utf8");
    res.json({ success: true, data: userData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Gửi dữ liệu hiện tại cho client mới
  socket.emit("dataUpdated", userData);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
