import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_BASE_URL = "https://api.dify.ai/v1";

async function uploadFileToDify(file) {
  const form = new FormData();

  form.append("file", fs.createReadStream(file.path), {
    filename: file.originalname,
    contentType: file.mimetype
  });

  form.append("user", "web-user");

  const res = await fetch(`${DIFY_BASE_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      ...form.getHeaders()
    },
    body: form
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`Dify 파일 업로드 실패: ${raw}`);
  }

  return JSON.parse(raw);
}

async function sendToDify(query, files) {
  const payload = {
    inputs: {},
    query: query || "첨부 이미지의 오류를 분석하고 담당자를 찾아주세요.",
    response_mode: "blocking",
    conversation_id: "",
    user: "web-user",
    files
  };

  const res = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`Dify 채팅 요청 실패: ${raw}`);
  }

  return JSON.parse(raw);
}

app.post("/dify/ask", upload.array("files"), async (req, res) => {
  try {
    const query = req.body.query || "";
    const difyFiles = [];

    for (const file of req.files || []) {
      const uploaded = await uploadFileToDify(file);

      difyFiles.push({
        type: file.mimetype.startsWith("image/") ? "image" : "document",
        transfer_method: "local_file",
        upload_file_id: uploaded.id
      });

      fs.unlink(file.path, () => {});
    }

    const result = await sendToDify(query, difyFiles);

    res.json({
      success: true,
      answer: result.answer,
      raw: result
    });
  } catch (error) {
    console.error("[DIFY_PROXY_ERROR]", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3000, () => {
  console.log("Dify proxy server running: http://localhost:3000");
});