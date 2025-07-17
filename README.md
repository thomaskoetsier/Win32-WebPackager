# Web-based Win32 Content Packager

![Demo](./assets/demo.gif)

A web application for packaging files using Microsoft's Win32 Content Prep Tool (IntuneWinAppUtil.exe) for Intune deployment. Upload your application files, and the tool will package them into the .intunewin format with a download link valid for 7 days.

## Features

- 🎯 **Drag & Drop File Upload** - Easy file upload with drag-and-drop support
- 📦 **Batch Processing** - Package multiple files at once
- ⏱️ **Real-time Progress** - Visual progress tracking during packaging
- 🔗 **Temporary Download Links** - Secure download links that expire after 24 hours
- 🧹 **Automatic Cleanup** - Expired packages are automatically removed
- 💾 **File Management** - Preview and manage uploaded files before packaging
- 🎨 **Modern UI** - Clean, responsive interface with smooth animations

## Prerequisites

- Node.js (v14.0.0 or higher)
- npm (comes with Node.js)
- Windows OS (for IntuneWinAppUtil.exe)
- [Microsoft Win32 Content Prep Tool](https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool)

## Installation

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd win32-content-packager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Download the Win32 Content Prep Tool**
   - Download `IntuneWinAppUtil.exe` from [Microsoft's GitHub](https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool/releases)
   - Place `IntuneWinAppUtil.exe` in the root directory of the project (same folder as `server.js`)

4. **Create required directories**
   The application will automatically create these directories on first run:
   - `public/` - Frontend files
   - `temp_uploads/` - Temporary upload storage
   - `packages/` - Packaged files storage

5. **Move the frontend file**
   - Save the HTML file as `public/index.html`

## Project Structure

```
win32-content-packager/
├── server.js              # Backend server
├── package.json           # Node.js dependencies
├── IntuneWinAppUtil.exe   # Win32 Content Prep Tool (you need to add this)
├── packages_db.json       # Package metadata (auto-created)
├── public/
│   └── index.html         # Frontend application
├── packages/              # Stored packages (auto-created)
└── temp_uploads/          # Temporary uploads (auto-created)
```

## Usage

1. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

2. **Access the application**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. **Package your files**
   - Drag and drop files or click to browse
   - Review uploaded files
   - Click "Package Files"
   - Wait for processing to complete
   - Download your packaged .intunewin file

## Configuration

### Environment Variables

You can configure the following environment variables:

- `PORT` - Server port (default: 3000)

Example:
```bash
PORT=8080 npm start
```

### File Limits

Default limits (can be modified in `server.js`):
- Maximum file size: 500MB per file
- Maximum files per upload: 50 files

## API Endpoints

### `POST /api/package`
Upload and package files
- **Body**: Multipart form data with files
- **Response**: JSON with download URL and package ID

### `GET /api/download/:id`
Download a packaged file
- **Parameters**: Package ID
- **Response**: .intunewin file download

### `GET /api/package/:id`
Get package information
- **Parameters**: Package ID
- **Response**: JSON with package metadata

### `GET /api/health`
Health check endpoint
- **Response**: JSON with server status

## Demo Mode

If `IntuneWinAppUtil.exe` is not found, the application runs in demo mode:
- Creates mock .intunewin files
- Useful for testing the UI and workflow
- Files contain JSON metadata instead of actual packaged content

## Security Considerations

1. **HTTPS**: Use HTTPS in production environments
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **File Size Limits**: Adjust limits based on your requirements

## Troubleshooting

### Common Issues

1. **"IntuneWinAppUtil.exe not found"**
   - Ensure the tool is in the root directory
   - Check file permissions

2. **"Packaging failed"**
   - Verify all uploaded files are accessible
   - Check if there's at least one .exe file
   - Review server logs for detailed error messages

3. **"Download link expired"**
   - Package links expire after 24 hours
   - Re-upload and package files

### Logs

The server logs important events to the console:
- Package creation
- Download requests
- Cleanup operations
- Errors and warnings

## Development

### To-do

1. **Database Integration**
   Replace the JSON file database with:
   - PostgreSQL
   - MongoDB
   - SQLite

2. **Cloud Storage**
   Store packages in:
   - AWS S3
   - Azure Blob Storage
   - Google Cloud Storage

3. **Authentication**
   Add user authentication:
   - JWT tokens
   - OAuth integration
   - Active Directory

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs
3. Create an issue in the repository

## Acknowledgments

- Microsoft for the Win32 Content Prep Tool
- The Intune community for deployment best practices