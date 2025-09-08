const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAoquPniP0luO69Wp4a0BjMBuJ0NCkorww",
  authDomain: "checkin-btn.firebaseapp.com",
  projectId: "checkin-btn",
  storageBucket: "checkin-btn.firebasestorage.app",
  messagingSenderId: "506549956580",
  appId: "1:506549956580:web:a1835a078be28d304861f1",
  measurementId: "G-4Y3KLXYER5",
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("", (req, res) => {
  res.sendFile("/index.html", { root: "public" });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Cấu hình multer để upload file vào bộ nhớ
const upload = multer({ storage: multer.memoryStorage() });

// Routes
app.post("/upload-excel", upload.single("excelFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file được upload" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
    console.log("Dữ liệu Excel:", jsonData);

    const usersRef = collection(db, "DataList");
    const batch = [];

    jsonData.forEach((row) => {
      const userData = {
        MA: String(row["MÃ"] || row["MA"] || "").trim(),
        HOVATEN: row["HỌ VÀ TÊN"] || row["HO VA TEN"] || "",
        GIOITINH: row["GIỚI TÍNH"] || row["GIOI TINH"] || "",
        DIACHI: row["ĐỊA CHỈ"] || row["DIA CHI"] || "",
        KHOAPHONG: row["KHOA/PHÒNG"] || row["KHOA PHONG"] || row["KHOA"] || "",
        DONVI: row["ĐƠN VỊ"] || row["DON VI"] || "",
        CHECKIN: "Chưa vào",
        timestamp: null,
      };
      batch.push(setDoc(doc(usersRef, userData.MA), userData));
    });

    await Promise.all(batch);

    // Get all users after upload
    const querySnapshot = await getDocs(collection(db, "DataList"));
    const updatedData = querySnapshot.docs.map((doc) => doc.data());

    // Broadcast dữ liệu mới cho tất cả client
    io.emit("dataUpdated", updatedData);

    res.json({
      success: true,
      data: updatedData,
      message: `Đã import ${jsonData.length} records`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/data", async (req, res) => {
  try {
    console.log("Đang lấy dữ liệu từ Firestore...");
    const usersRef = collection(db, "DataList");
    const querySnapshot = await getDocs(usersRef);
    console.log("Số lượng documents:", querySnapshot.size);

    const userData = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      console.log("Document data:", doc.id, data);
      return data;
    });

    console.log("Tổng số dữ liệu:", userData.length);
    res.json({ data: userData });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

app.post("/checkin", async (req, res) => {
  try {
    const { code } = req.body;
    const trimmedCode = String(code).trim();

    const userRef = doc(db, "DataList", trimmedCode);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.json({ success: false, message: "Không tìm thấy mã này" });
    }

    const person = userSnap.data();

    if (person.CHECKIN === "Đã vào") {
      res.json({
        success: false,
        message: "Đã checkin trước đó",
        person: person,
      });
    } else {
      await updateDoc(userRef, {
        CHECKIN: "Đã vào",
        timestamp: new Date().toLocaleString(),
      });

      const updatedPerson = {
        ...person,
        checkin: "Đã vào",
        timestamp: new Date().toLocaleString(),
      };

      // Get updated data for all clients
      const querySnapshot = await getDocs(collection(db, "DataList"));
      const updatedData = querySnapshot.docs.map((doc) => doc.data());
      io.emit("dataUpdated", updatedData);

      res.json({
        success: true,
        message: "Checkin thành công",
        person: updatedPerson,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/export-excel", async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, "DataList"));
    const userData = querySnapshot.docs.map((doc) => doc.data());

    const exportData = userData.map((person) => ({
      MÃ: person.MA,
      "HỌ VÀ TÊN": person.HOVATEN,
      "GIỚI TÍNH": person.GIOITINH,
      "ĐỊA CHỈ": person.DIACHI,
      "KHOA/PHÒNG": person.KHOAPHONG,
      "ĐƠN VỊ": person.DONVI,
      CHECKIN: person.CHECKIN,
      "THỜI GIAN": person.timestamp || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checkin Data");

    const now = new Date();
    const filename = `checkin_data_${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(
      now.getHours()
    ).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.end(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/edit-person", async (req, res) => {
  try {
    console.log("Received edit request:", req.body);
    const { ma, updated } = req.body;

    const userRef = doc(db, "DataList", ma);
    console.log("Checking document:", ma);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.log("Document not found:", ma);
      return res.json({ success: false, message: "Không tìm thấy người này" });
    }

    console.log("Current data:", userSnap.data());
    console.log("Updating with:", updated);

    // Cập nhật thông tin người dùng
    await updateDoc(userRef, updated);

    // Get updated data
    const updatedSnap = await getDoc(userRef);
    const updatedPerson = updatedSnap.data();
    console.log("Updated data:", updatedPerson);

    // Get all updated data for broadcast
    const querySnapshot = await getDocs(collection(db, "DataList"));
    const updatedData = querySnapshot.docs.map((doc) => doc.data());
    io.emit("dataUpdated", updatedData);

    res.json({ success: true, data: updatedPerson });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io connection
io.on("connection", async (socket) => {
  console.log("Client connected:", socket.id);

  // Gửi dữ liệu hiện tại cho client mới
  try {
    const usersRef = collection(db, "DataList");
    const querySnapshot = await getDocs(usersRef);
    console.log("Socket: Số lượng documents:", querySnapshot.size);

    const userData = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      console.log("Socket: Document data:", doc.id, data);
      return data;
    });

    console.log("Socket: Gửi dữ liệu cho client", socket.id);
    socket.emit("dataUpdated", userData);
  } catch (error) {
    console.error("Socket: Lỗi khi lấy dữ liệu:", error);
  }

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
