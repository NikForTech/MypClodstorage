# Playbook File Upload Application

A secure Node.js web application that allows authenticated users to upload files to their Playbook account using a secret API key for access control.

## Features

- 🔐 **Secure Authentication**: Secret key-based access control with timing-safe comparison
- 📤 **File Upload**: Support for any file type (video, audio, images, documents, etc.)
- 🎨 **Modern UI**: Beautiful glass-morphism design with drag-and-drop functionality
- 🛡️ **Security**: Rate limiting, file type validation, secure headers, and more
- 📊 **Progress Tracking**: Real-time upload progress with visual feedback
- 🧹 **Auto Cleanup**: Temporary files are automatically deleted after upload

## Tech Stack

- **Backend**: Node.js with Express.js
- **File Handling**: Multer for multipart/form-data
- **HTTP Requests**: Axios for Playbook API calls
- **Frontend**: Pure HTML, CSS, and vanilla JavaScript
- **Security**: Helmet, express-rate-limit, express-validator
- **File Validation**: file-type package for MIME type detection

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Playbook API credentials (API key and Team ID)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd playbook-file-upload
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your credentials:
   ```env
   PORT=3000
   UPLOAD_SECRET_KEY=your_secret_key_here
   PLAYBOOK_API_KEY=your_playbook_api_key
   PLAYBOOK_TEAM_ID=your_playbook_team_id
   PLAYBOOK_API_BASE_URL=https://api.playbook.com/api/v1
   MAX_FILE_SIZE_MB=500
   ```

## Getting Playbook API Credentials

1. **Log in to Playbook**
   - Go to [Playbook](https://playbook.com) and sign in to your account

2. **Get your API Key**
   - Navigate to your account settings
   - Go to API section or Developer settings
   - Generate a new API key with `asset-upload` permission
   - Copy the API key

3. **Get your Team ID**
   - The Team ID is typically your organization slug
   - You can find it in your Playbook organization settings
   - It may also be visible in your Playbook URL: `playbook.com/p/{team-id}`

4. **Set up your credentials**
   - Add the API key to `PLAYBOOK_API_KEY` in your `.env` file
   - Add the Team ID to `PLAYBOOK_TEAM_ID` in your `.env` file

## Running the Application

### Development Mode
```bash
npm run dev
```
This uses `nodemon` to automatically restart the server on file changes.

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## Usage

1. **Open the application**
   - Navigate to `http://localhost:3000` in your browser

2. **Enter your upload key**
   - Enter the secret key configured in `UPLOAD_SECRET_KEY` environment variable
   - Use the eye icon to toggle password visibility

3. **Select a file**
   - Drag and drop a file onto the upload zone, or
   - Click the upload zone to browse and select a file

4. **Upload**
   - Click the "Upload File" button
   - Watch the progress bar as your file uploads
   - Once complete, you'll see a success message with a link to view the file in Playbook

## Security Features

- ✅ Timing-safe key comparison (prevents timing attacks)
- ✅ Rate limiting (20 uploads per IP per 15 minutes)
- ✅ File size limits (configurable via `MAX_FILE_SIZE_MB`)
- ✅ File type validation using magic bytes (not just extensions)
- ✅ UUID-based temporary filenames (prevents name collisions)
- ✅ Automatic temp file cleanup (always deleted after upload)
- ✅ Helmet.js security headers (CSP, HSTS, X-Frame-Options, etc.)
- ✅ No stack traces exposed to clients
- ✅ Input sanitization with express-validator
- ✅ CORS restricted to same origin only
- ✅ Failed authentication attempts logged with IP and timestamp

## Project Structure

```
project/
├── server.js              # Express server with all routes and middleware
├── .env                   # Environment variables (not committed)
├── .env.example           # Example environment variables
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
├── README.md              # This file
├── public/                # Frontend files
│   ├── index.html         # Main HTML page
│   ├── style.css          # Styles with glass-morphism design
│   └── script.js          # Vanilla JavaScript for upload functionality
└── uploads/               # Temporary file storage (not committed)
```

## API Endpoints

### GET /
Serves the main upload page (`public/index.html`).

### POST /upload
Uploads a file to Playbook.

**Headers:**
- `x-upload-key`: Secret upload key (alternative to form field)

**Form Data:**
- `file`: The file to upload (multipart/form-data)
- `uploadKey`: Secret upload key (alternative to header)

**Response (Success):**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "assetUrl": "https://playbook.com/...",
  "assetId": "asset-id",
  "filename": "example.mp4",
  "size": 1024000,
  "mimeType": "video/mp4"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Error message here"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `UPLOAD_SECRET_KEY` | Secret key for upload authentication | Required |
| `PLAYBOOK_API_KEY` | Playbook API authentication key | Required |
| `PLAYBOOK_TEAM_ID` | Playbook team/organization ID | Required |
| `PLAYBOOK_API_BASE_URL` | Playbook API base URL | `https://api.playbook.com/api/v1` |
| `MAX_FILE_SIZE_MB` | Maximum file size in MB | `500` |

## Troubleshooting

### Upload fails with "Unauthorized"
- Verify that `UPLOAD_SECRET_KEY` matches the key you're entering in the form
- Check that the key is being sent (check browser network tab)

### Upload fails with "Playbook API error"
- Verify your `PLAYBOOK_API_KEY` is correct and has upload permissions
- Check that `PLAYBOOK_TEAM_ID` is correct
- Ensure your API key has the `asset-upload` permission

### File size errors
- Check that your file is under the `MAX_FILE_SIZE_MB` limit
- Verify the limit in your `.env` file

### Port already in use
- Change the `PORT` in your `.env` file
- Or stop the process using the current port

## License

ISC

## Support

For issues related to:
- **This application**: Check the troubleshooting section or open an issue
- **Playbook API**: Refer to [Playbook API Documentation](https://dev.playbook.com/docs)
