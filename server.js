const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
// Kết nối MongoDB với username là MSSV, password là MSSV, dbname là it4409
mongoose
  .connect(
    "mongodb+srv://20224921:20224921@cluster0.gq32y8g.mongodb.net/it4409?retryWrites=true&w=majority"
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB Error:", err));

// Schema User
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    age: {
      type: Number,
      validate: {
        validator: Number.isInteger,
        message: "Tuổi phải là số nguyên",
      },
    },
    email: { type: String, required: true, unique: true },
    address: { type: String },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

// Start server
app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});

// 1.3. Implement GET với Pagination + Search
// Format: GET /api/users?page=1&limit=5&search=nguyen
// Gợi ý:
app.get("/api/users", async (req, res) => {
  try {
    // Lấy query params và chuẩn hóa
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 5));
    const search = (req.query.search || "").trim();

    // Tạo query filter cho search
    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // Tính skip
    const skip = (page - 1) * limit;

    // Sử dụng Promise.all để truy vấn song song
    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);
    // Trả về response
    res.json({
      page,
      limit,
      total,
      totalPages,
      data: users,
    });
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: "Lỗi máy chủ khi tải danh sách người dùng" });
  }
});
// Giải thích:
// • $or: Tìm trong nhiều field
// • $regex: Pattern matching
// • $options: "i": Không phân biệt hoa thường
// • skip(): Bỏ qua N documents đầu
// • limit(): Chỉ lấy M documents

// 1.5. Implement PUT
// Format: PUT /api/users/:id
// Content-Type: application/json
// Gợi ý:
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID người dùng không hợp lệ" });
    }

    // Chuẩn hóa dữ liệu đầu vào - chỉ lấy trường được truyền
    const normalizedData = normalizeUserDataForUpdate(req.body);

    // Kiểm tra có trường nào được cập nhật không
    if (Object.keys(normalizedData).length === 0) {
      return res.status(400).json({ error: "Không có dữ liệu để cập nhật" });
    }

    // Validate dữ liệu
    const validationErrors = validateUserData(normalizedData, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors.join(", "),
        details: validationErrors,
      });
    }

    // Kiểm tra email đã tồn tại (trừ user hiện tại) - chỉ khi email được cập nhật
    if (normalizedData.email) {
      const existingUser = await User.findOne({
        email: normalizedData.email,
        _id: { $ne: id },
      });
      if (existingUser) {
        return res.status(409).json({
          error: "Email đã được sử dụng bởi người dùng khác",
        });
      }
    }

    // Sử dụng $set để chỉ cập nhật trường được truyền vào
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: normalizedData },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    res.json({
      message: "Cập nhật người dùng thành công",
      data: updatedUser,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({
        error:
          "Dữ liệu không hợp lệ: " +
          Object.values(err.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }
    if (err.name === "CastError") {
      return res.status(400).json({ error: "ID người dùng không hợp lệ" });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: "Email đã tồn tại trong hệ thống" });
    }
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ error: "Lỗi máy chủ: " + err.message });
  }
});

// Hàm chuẩn hóa dữ liệu - loại bỏ khoảng trắng thừa
const normalizeUserData = (data) => {
  return {
    name: data.name?.trim() || "",
    age:
      data.age !== undefined && data.age !== ""
        ? parseInt(data.age, 10)
        : undefined,
    email: data.email?.trim().toLowerCase() || "",
    address: data.address?.trim() || "",
  };
};

// Hàm chuẩn hóa dữ liệu cho UPDATE - chỉ cập nhật trường được truyền vào
const normalizeUserDataForUpdate = (data) => {
  const updateData = {};

  // Chỉ thêm trường nếu được truyền vào (không ghi null cho trường thiếu)
  if (data.name !== undefined && data.name !== null) {
    updateData.name = data.name.trim();
  }

  if (data.age !== undefined && data.age !== null && data.age !== "") {
    updateData.age = parseInt(data.age, 10);
  }

  if (data.email !== undefined && data.email !== null) {
    updateData.email = data.email.trim().toLowerCase();
  }

  if (data.address !== undefined && data.address !== null) {
    updateData.address = data.address.trim();
  }

  return updateData;
};

// Hàm validate dữ liệu
const validateUserData = (data, isUpdate = false) => {
  const errors = [];

  // Với update, chỉ validate trường được truyền vào
  if (isUpdate) {
    if (data.name !== undefined && data.name.length < 2) {
      errors.push("Tên phải có ít nhất 2 ký tự");
    }
    if (
      data.age !== undefined &&
      (isNaN(data.age) ||
        !Number.isInteger(data.age) ||
        data.age < 0 ||
        data.age > 150)
    ) {
      errors.push("Tuổi phải là số nguyên từ 0 đến 150");
    }
    if (
      data.email !== undefined &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    ) {
      errors.push("Email không đúng định dạng");
    }
  } else {
    // Với create, validate tất cả các trường bắt buộc
    if (!data.name || data.name.length < 2) {
      errors.push("Tên phải có ít nhất 2 ký tự");
    }
    if (
      data.age !== undefined &&
      (isNaN(data.age) ||
        !Number.isInteger(data.age) ||
        data.age < 0 ||
        data.age > 150)
    ) {
      errors.push("Tuổi phải là số nguyên từ 0 đến 150");
    }
    if (!data.email) {
      errors.push("Email là bắt buộc");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push("Email không đúng định dạng");
    }
  }

  return errors;
};

// 1.4. Implement POST
// Format: POST /api/users
// Content-Type: application/json
// Gợi ý:
app.post("/api/users", async (req, res) => {
  try {
    // Chuẩn hóa dữ liệu đầu vào
    const normalizedData = normalizeUserData(req.body);

    // Validate dữ liệu
    const validationErrors = validateUserData(normalizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors.join(", "),
        details: validationErrors,
      });
    }

    // Kiểm tra email đã tồn tại
    const existingUser = await User.findOne({ email: normalizedData.email });
    if (existingUser) {
      return res.status(409).json({
        error: "Email đã tồn tại trong hệ thống",
      });
    }

    // Tạo user mới
    const newUser = await User.create(normalizedData);
    res.status(201).json({
      message: "Tạo người dùng thành công",
      data: newUser,
    });
  } catch (err) {
    // Xử lý các loại lỗi khác nhau
    if (err.name === "ValidationError") {
      return res.status(400).json({
        error:
          "Dữ liệu không hợp lệ: " +
          Object.values(err.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Email đã tồn tại trong hệ thống",
      });
    }
    console.error("POST /api/users error:", err);
    res.status(500).json({ error: "Lỗi máy chủ: " + err.message });
  }
});

// 1.6. Implement DELETE
// Format: DELETE /api/users/:id
// Gợi ý:
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID người dùng không hợp lệ" });
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    res.json({
      message: "Xóa người dùng thành công",
      data: deletedUser,
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ error: "ID người dùng không hợp lệ" });
    }
    console.error("DELETE /api/users/:id error:", err);
    res.status(500).json({ error: "Lỗi máy chủ: " + err.message });
  }
});
