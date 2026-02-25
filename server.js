require('dotenv').config();
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const axios = require('axios');

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Google Drive ─────────────────────────────────────────────────────────────
const { google } = require('googleapis');
const googleAuth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
googleAuth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const driveClient = google.drive({ version: 'v3', auth: googleAuth });

// ─── OneDrive token helper ────────────────────────────────────────────────────
// async function getOneDriveToken() {
//   const res = await axios.post(
//     'https://login.microsoftonline.com/common/oauth2/v2.0/token',
//     new URLSearchParams({
//       client_id:     process.env.ONEDRIVE_CLIENT_ID,
//       client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
//       refresh_token: process.env.ONEDRIVE_REFRESH_TOKEN,
//       grant_type:    'refresh_token',
//       scope:         'Files.ReadWrite offline_access',
//     }),
//     { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
//   );
//   return res.data.access_token;
// }

// ─────────────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE_MB    = parseInt(process.env.MAX_FILE_SIZE_MB || 500);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
    },
  },
}));
app.disable('x-powered-by');
app.use(express.json({ limit: `${MAX_FILE_SIZE_MB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${MAX_FILE_SIZE_MB}mb` }));
app.use(express.static('public'));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many upload attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE_BYTES } });

// ─── Timing-safe key comparison ───────────────────────────────────────────────
function timingSafeCompare(a, b) {
  const keyA = Buffer.from(a || '', 'utf8');
  const keyB = Buffer.from(b || '', 'utf8');
  if (keyA.length !== keyB.length) {
    crypto.timingSafeEqual(keyA, keyA);
    return false;
  }
  return crypto.timingSafeEqual(keyA, keyB);
}

// ─── Secret key middleware ────────────────────────────────────────────────────
async function validateSecretKey(req, res, next) {
  try {
    const providedKey = req.headers['x-upload-key'] || req.body?.uploadKey;
    const expectedKey = process.env.UPLOAD_SECRET_KEY;

    if (!expectedKey) {
      console.error('[ERROR] UPLOAD_SECRET_KEY not configured');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }
    if (!providedKey) {
      console.warn(`[AUTH FAIL] Missing key — IP: ${req.ip} — ${new Date().toISOString()}`);
      return res.status(401).json({ success: false, message: 'Unauthorized: Missing upload key' });
    }
    if (!timingSafeCompare(providedKey, expectedKey)) {
      console.warn(`[AUTH FAIL] Wrong key — IP: ${req.ip} — ${new Date().toISOString()}`);
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid upload key' });
    }
    next();
  } catch (error) {
    console.error('[ERROR] Key validation:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLOUD UPLOAD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Cloudinary — 25 GB free ────────────────────────────────────────────────
async function uploadToCloudinary(filePath, originalFilename) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('Cloudinary not configured');

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type:   'auto',   // auto-detects video / audio / image / raw
    use_filename:    true,
    unique_filename: true,
    folder:          'uploads',
  });

  return {
    url:     result.secure_url,
    id:      result.public_id,
    service: 'Cloudinary',
  };
}

// ── 2. Google Drive — 15 GB free ──────────────────────────────────────────────
async function uploadToGoogleDrive(filePath, originalFilename) {
  if (!process.env.GOOGLE_REFRESH_TOKEN) throw new Error('Google Drive not configured');

  const mediaType = mime.lookup(originalFilename) || 'application/octet-stream';
  const folderId  = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const res = await driveClient.files.create({
    requestBody: {
      name:    originalFilename,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: {
      mimeType: mediaType,
      body:     fsSync.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });

  // Make file publicly viewable
  await driveClient.permissions.create({
    fileId:      res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    url:     res.data.webViewLink,
    id:      res.data.id,
    service: 'Google Drive',
  };
}

// ── 3. OneDrive — 5 GB free ───────────────────────────────────────────────────
// async function uploadToOneDrive(filePath, originalFilename) {
//   if (!process.env.ONEDRIVE_REFRESH_TOKEN) throw new Error('OneDrive not configured');

//   const token      = await getOneDriveToken();
//   const fileBuffer = fsSync.readFileSync(filePath);
//   const mediaType  = mime.lookup(originalFilename) || 'application/octet-stream';
//   const fileSizeMB = fileBuffer.length / (1024 * 1024);

//   let fileData;

//   if (fileSizeMB <= 4) {
//     // ── Small file: simple PUT upload
//     const res = await axios.put(
//       `https://graph.microsoft.com/v1.0/me/drive/root:/uploads/${encodeURIComponent(originalFilename)}:/content`,
//       fileBuffer,
//       {
//         headers: {
//           'Authorization': `Bearer ${token}`,
//           'Content-Type':  mediaType,
//         },
//         maxBodyLength: Infinity,
//       }
//     );
//     fileData = res.data;
//   } else {
//     // ── Large file: chunked upload session (10 MB chunks)
//     const sessionRes = await axios.post(
//       `https://graph.microsoft.com/v1.0/me/drive/root:/uploads/${encodeURIComponent(originalFilename)}:/createUploadSession`,
//       { item: { '@microsoft.graph.conflictBehavior': 'rename' } },
//       { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
//     );

//     const uploadUrl  = sessionRes.data.uploadUrl;
//     const chunkSize  = 10 * 1024 * 1024;
//     const totalBytes = fileBuffer.length;
//     let   offset     = 0;

//     while (offset < totalBytes) {
//       const chunk    = fileBuffer.slice(offset, offset + chunkSize);
//       const chunkEnd = Math.min(offset + chunkSize - 1, totalBytes - 1);

//       const chunkRes = await axios.put(uploadUrl, chunk, {
//         headers: {
//           'Content-Range':  `bytes ${offset}-${chunkEnd}/${totalBytes}`,
//           'Content-Length': String(chunk.length),
//         },
//         maxBodyLength: Infinity,
//       });

//       if (chunkRes.status === 201 || chunkRes.status === 200) {
//         fileData = chunkRes.data;
//       }
//       offset += chunkSize;
//     }
//   }

//   // Create public share link
//   const shareRes = await axios.post(
//     `https://graph.microsoft.com/v1.0/me/drive/items/${fileData.id}/createLink`,
//     { type: 'view', scope: 'anonymous' },
//     { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
//   );

//   return {
//     url:     shareRes.data.link?.webUrl || fileData.webUrl,
//     id:      fileData.id,
//     service: 'OneDrive',
//   };
// }

// ═══════════════════════════════════════════════════════════════════════════════
//  MULTI-CLOUD ORCHESTRATOR
//  Tries Cloudinary → Google Drive → OneDrive in order
//  Falls back to next if current one fails
// ═══════════════════════════════════════════════════════════════════════════════
async function uploadToMultiCloud(filePath, originalFilename) {
  const clouds = [
    { name: 'Cloudinary',   fn: uploadToCloudinary   },
    { name: 'Google Drive', fn: uploadToGoogleDrive  },
    { name: 'OneDrive',     fn: uploadToOneDrive     },
  ];

  const errors = [];

  for (const cloud of clouds) {
    try {
      console.log(`[CLOUD] Trying ${cloud.name}...`);
      const result = await cloud.fn(filePath, originalFilename);
      console.log(`[CLOUD] ✓ Uploaded to ${cloud.name}`);
      return result;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.warn(`[CLOUD] ✗ ${cloud.name} failed: ${msg}`);
      errors.push(`${cloud.name}: ${msg}`);
    }
  }

  throw new Error(`All cloud storage options exhausted:\n${errors.join('\n')}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post(
  '/upload',
  uploadRateLimiter,
  upload.single('file'),
  [body('uploadKey').optional().trim().escape()],
  validateSecretKey,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid input data' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const tempFilePath = req.file.path;

    try {
      const result = await uploadToMultiCloud(tempFilePath, req.file.originalname);

      return res.json({
        success:  true,
        message:  `File uploaded successfully via ${result.service}! 🎉`,
        assetUrl: result.url,
        assetId:  result.id,
        service:  result.service,
        filename: req.file.originalname,
        size:     req.file.size,
      });

    } catch (error) {
      console.error('[ERROR] All uploads failed:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Upload failed on all storage providers. Please try again.',
      });

    } finally {
      // Always clean up temp file
      fs.unlink(tempFilePath).catch(err =>
        console.error('[ERROR] Temp file cleanup failed:', err.message)
      );
    }
  }
);

// ─── Error handlers ───────────────────────────────────────────────────────────
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`,
      });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${error.message}` });
  }
  console.error('[ERROR] Unhandled:', error.message);
  res.status(500).json({ success: false, message: 'An unexpected error occurred' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Server → http://localhost:${PORT}`);
  console.log(`📦  Max file size : ${MAX_FILE_SIZE_MB} MB`);
  console.log(`☁️   Cloudinary   : ${process.env.CLOUDINARY_CLOUD_NAME  ? '✅ ready' : '❌ not configured'}`);
  console.log(`📁  Google Drive  : ${process.env.GOOGLE_REFRESH_TOKEN   ? '✅ ready' : '❌ not configured'}`);
  console.log(`💾  OneDrive      : ${process.env.ONEDRIVE_REFRESH_TOKEN ? '✅ ready' : '❌ not configured'}`);
  console.log('');
});