require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto     = require('crypto');
const fs         = require('fs').promises;
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const cloudinarySDK  = require('cloudinary').v2;

// ─────────────────────────────────────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB    = 5; // hard-capped at 5 MB for Netlify
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
//  Cloudinary Account Pool
// ─────────────────────────────────────────────────────────────────────────────
const cloudinaryAccounts = [
  {
    name:       'Cloudinary-1',
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME_1,
    api_key:    process.env.CLOUDINARY_API_KEY_1,
    api_secret: process.env.CLOUDINARY_API_SECRET_1,
  },
  {
    name:       'Cloudinary-2',
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME_2,
    api_key:    process.env.CLOUDINARY_API_KEY_2,
    api_secret: process.env.CLOUDINARY_API_SECRET_2,
  },
  {
    name:       'Cloudinary-3',
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME_3,
    api_key:    process.env.CLOUDINARY_API_KEY_3,
    api_secret: process.env.CLOUDINARY_API_SECRET_3,
  },
].filter(acc => acc.cloud_name && acc.api_key && acc.api_secret);

// Round-robin pointer
let rrIndex = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  Express app
// ─────────────────────────────────────────────────────────────────────────────
const app = express();

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

// ─────────────────────────────────────────────────────────────────────────────
//  Rate limiter
// ─────────────────────────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many upload attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
//  Multer — memory storage (no disk writes, safe for serverless)
// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE_BYTES },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Auth helpers
// ─────────────────────────────────────────────────────────────────────────────
function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function validateSecretKey(req, res, next) {
  const provided = req.headers['x-upload-key'] || req.body?.uploadKey;
  const expected = process.env.UPLOAD_SECRET_KEY;

  if (!expected) {
    return res.status(500).json({ success: false, message: 'Server configuration error' });
  }
  if (!provided || !timingSafeCompare(provided, expected)) {
    console.warn(`[AUTH FAIL] IP: ${req.ip} — ${new Date().toISOString()}`);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cloudinary pool upload (buffer-based, no temp files)
// ─────────────────────────────────────────────────────────────────────────────
async function uploadToCloudinaryPool(fileBuffer, originalFilename) {
  if (cloudinaryAccounts.length === 0) {
    throw new Error('No Cloudinary accounts configured');
  }

  const errors = [];

  for (let i = 0; i < cloudinaryAccounts.length; i++) {
    const idx     = (rrIndex + i) % cloudinaryAccounts.length;
    const account = cloudinaryAccounts[idx];

    try {
      console.log(`[Cloudinary] Trying ${account.name}…`);

      cloudinarySDK.config({
        cloud_name: account.cloud_name,
        api_key:    account.api_key,
        api_secret: account.api_secret,
      });

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinarySDK.uploader.upload_stream(
          {
            resource_type:   'auto',
            use_filename:    true,
            unique_filename: true,
            folder:          'uploads',
            public_id:       `${uuidv4()}_${path.parse(originalFilename).name}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(fileBuffer);
      });

      rrIndex = (idx + 1) % cloudinaryAccounts.length;
      console.log(`[Cloudinary] ✓ Uploaded via ${account.name}`);

      return {
        url:     result.secure_url,
        id:      result.public_id,
        service: account.name,
      };

    } catch (err) {
      console.warn(`[Cloudinary] ✗ ${account.name} failed: ${err.message}`);
      errors.push(`${account.name}: ${err.message}`);
    }
  }

  throw new Error(`All Cloudinary accounts failed:\n${errors.join('\n')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Protected storage status
app.get('/status', validateSecretKey, async (req, res) => {
  const stats = await Promise.all(
    cloudinaryAccounts.map(async (account) => {
      try {
        cloudinarySDK.config({
          cloud_name: account.cloud_name,
          api_key:    account.api_key,
          api_secret: account.api_secret,
        });
        const usage = await cloudinarySDK.api.usage();
        return {
          account:          account.name,
          storage_used_gb:  (usage.storage.usage / 1024 ** 3).toFixed(2),
          storage_limit_gb: (usage.storage.limit  / 1024 ** 3).toFixed(2),
          status:           'ok',
        };
      } catch (err) {
        return { account: account.name, status: 'error', error: err.message };
      }
    })
  );

  res.json({
    success:         true,
    accounts_active: cloudinaryAccounts.length,
    next_rr_account: cloudinaryAccounts[rrIndex]?.name || 'N/A',
    cloudinary_pool: stats,
  });
});

// Upload
app.post(
  '/upload',
  uploadLimiter,
  upload.single('file'),
  [body('uploadKey').optional().trim().escape()],
  validateSecretKey,
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid input data' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    try {
      const result = await uploadToCloudinaryPool(req.file.buffer, req.file.originalname);
      return res.json({
        success:  true,
        message:  `Uploaded via ${result.service} 🎉`,
        assetUrl: result.url,
        assetId:  result.id,
        service:  result.service,
        filename: req.file.originalname,
        size:     req.file.size,
      });
    } catch (err) {
      console.error('[ERROR]', err.message);
      return res.status(500).json({ success: false, message: 'Upload failed on all accounts.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
//  Error handlers
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
    });
  }
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, message: 'Unexpected error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Local dev server (Netlify uses module.exports instead)
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT;
  app.listen(PORT, () => {
    console.log(`\n🚀  Server → http://localhost:${PORT}`);
    console.log(`📦  Max file size : ${MAX_FILE_SIZE_MB} MB`);
    console.log(`\n☁️   Cloudinary Pool (${cloudinaryAccounts.length}/3 configured):`);
    cloudinaryAccounts.forEach((acc, i) => {
      console.log(`     ${i + 1}. ${acc.name}  →  ${acc.cloud_name} ✅`);
    });
    for (let i = cloudinaryAccounts.length; i < 3; i++) {
      console.log(`     ${i + 1}. Cloudinary-${i + 1} ❌ not configured`);
    }
    console.log('');
  });
}

module.exports = app; // Netlify needs this
