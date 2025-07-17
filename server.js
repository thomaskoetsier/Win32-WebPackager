const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const cron = require('node-cron');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Custom logger for file uploads
const uploadLogger = (req, res, next) => {
    if (req.path === '/api/package' && req.method === 'POST') {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        console.log(`[UPLOAD] IP: ${ip} | User-Agent: ${userAgent} | Timestamp: ${new Date().toISOString()}`);
    }
    next();
};

// Middleware
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));
app.use(express.static('public'));
app.use(morgan('combined')); // HTTP request logging
app.use(uploadLogger); // Custom upload logging

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = 'temp_uploads';
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB limit per file
        files: 50 // Maximum 50 files
    }
});

// Database (using JSON file for simplicity - in production use a real database)
const DB_FILE = 'packages_db.json';

async function loadDatabase() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { packages: [] };
    }
}

async function saveDatabase(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

async function savePackageInfo(packageInfo) {
    const db = await loadDatabase();
    db.packages.push(packageInfo);
    await saveDatabase(db);
}

async function getPackageInfo(id) {
    const db = await loadDatabase();
    return db.packages.find(pkg => pkg.id === id);
}

async function removePackageInfo(id) {
    const db = await loadDatabase();
    db.packages = db.packages.filter(pkg => pkg.id !== id);
    await saveDatabase(db);
}

// Ensure required directories exist
async function ensureDirectories() {
    const dirs = ['temp_uploads', 'packages', 'public', 'logs'];
    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

// Log package creation
async function logPackageCreation(packageInfo, req) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const logEntry = {
        timestamp: new Date().toISOString(),
        ip: ip,
        packageId: packageInfo.id,
        files: packageInfo.uploadedFiles,
        setupFile: packageInfo.setupFile,
        fileCount: packageInfo.fileCount,
        totalSize: packageInfo.totalSize
    };
    
    const logFile = path.join('logs', `packages_${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    
    console.log('[PACKAGE CREATED]', JSON.stringify(logEntry, null, 2));
}

// Package endpoint
app.post('/api/package', upload.array('files', 50), async (req, res) => {
    let tempFiles = req.files || [];
    const setupFile = req.body.setupFile;
    
    console.log(`[PACKAGE REQUEST] Files: ${tempFiles.length}, Setup: ${setupFile}`);
    
    try {
        if (tempFiles.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!setupFile) {
            return res.status(400).json({ error: 'No setup file specified' });
        }

        // Calculate total size
        const totalSize = tempFiles.reduce((sum, file) => sum + file.size, 0);
        console.log(`[PACKAGE SIZE] Total: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

        const packageId = crypto.randomBytes(16).toString('hex');
        const packageDir = path.join('packages', packageId);
        const sourceDir = path.join(packageDir, 'source');
        
        console.log(`[PACKAGE ID] ${packageId}`);
        
        // Create directories
        await fs.mkdir(sourceDir, { recursive: true });
        
        // Track uploaded files
        const uploadedFiles = [];
        
        // Move uploaded files to source directory
        for (const file of tempFiles) {
            const destPath = path.join(sourceDir, file.originalname);
            await fs.rename(file.path, destPath);
            uploadedFiles.push({
                name: file.originalname,
                size: file.size
            });
            console.log(`[FILE MOVED] ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }
        
        // Clear temp files array since we've moved them
        tempFiles = [];
        
        // Verify setup file exists
        const setupFilePath = path.join(sourceDir, setupFile);
        try {
            await fs.access(setupFilePath);
        } catch (error) {
            await fs.rm(packageDir, { recursive: true, force: true });
            return res.status(400).json({ 
                error: 'Setup file not found', 
                details: `The specified setup file "${setupFile}" was not found in the uploaded files.` 
            });
        }
        
        // Create output directory
        const outputDir = path.join(packageDir, 'output');
        await fs.mkdir(outputDir, { recursive: true });
        
        // Check if IntuneWinAppUtil.exe exists
        const intuneToolPath = path.join(__dirname, 'IntuneWinAppUtil.exe');
        try {
            await fs.access(intuneToolPath);
        } catch (error) {
            // If tool doesn't exist, create a mock .intunewin file for demo purposes
            console.log('[DEMO MODE] Win32 Content Prep Tool not found, creating mock package...');
            
            // Create a simple zip file as mock (in real scenario, this would be the actual tool output)
            const outputFile = path.join(outputDir, `${path.basename(setupFile, path.extname(setupFile))}.intunewin`);
            
            // For demo: just create a file with package info
            const packageContent = {
                packageId,
                files: uploadedFiles,
                setupFile,
                created: new Date().toISOString(),
                mock: true
            };
            
            await fs.writeFile(outputFile, JSON.stringify(packageContent, null, 2));
            
            // Save package info
            const packageInfo = {
                id: packageId,
                created: new Date().toISOString(),
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
                filename: path.basename(outputFile),
                path: outputFile,
                fileCount: uploadedFiles.length,
                setupFile,
                uploadedFiles,
                totalSize
            };
            
            await savePackageInfo(packageInfo);
            await logPackageCreation(packageInfo, req);
            
            return res.json({ 
                downloadUrl: `/api/download/${packageId}`,
                packageId,
                message: 'Package created (demo mode - IntuneWinAppUtil.exe not found)'
            });
        }
        
        // Execute Win32 Content Prep Tool
        const command = `"${intuneToolPath}" -c "${sourceDir}" -s "${setupFile}" -o "${outputDir}" -q`;
        
        console.log('[EXECUTING]', command);
        
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, async (error, stdout, stderr) => {
            if (error) {
                console.error('[PACKAGING ERROR]', error);
                console.error('[STDERR]', stderr);
                console.error('[STDOUT]', stdout);
                
                // Clean up on error
                await fs.rm(packageDir, { recursive: true, force: true });
                
                // Extract meaningful error from output
                let errorDetails = stderr || stdout || error.message;
                
                // Common error patterns
                if (errorDetails.includes('is not recognized')) {
                    errorDetails = 'IntuneWinAppUtil.exe not found or not executable';
                } else if (errorDetails.includes('Access is denied')) {
                    errorDetails = 'Access denied to IntuneWinAppUtil.exe or source files';
                } else if (errorDetails.includes('cannot find the file')) {
                    errorDetails = `Setup file "${setupFile}" not found in source directory`;
                }
                
                return res.status(500).json({ 
                    error: 'Packaging failed', 
                    details: errorDetails
                });
            }
            
            console.log('[PACKAGING SUCCESS]');
            if (stdout) console.log('[STDOUT]', stdout);
            
            // Find the generated .intunewin file
            const outputFiles = await fs.readdir(outputDir);
            const intunewinFile = outputFiles.find(f => f.endsWith('.intunewin'));
            
            if (!intunewinFile) {
                console.error('[ERROR] No .intunewin file found after processing');
                await fs.rm(packageDir, { recursive: true, force: true });
                return res.status(500).json({ 
                    error: 'Package file not found after processing',
                    details: 'The tool completed but no .intunewin file was generated' 
                });
            }
            
            const outputPath = path.join(outputDir, intunewinFile);
            
            // Get file size
            const stats = await fs.stat(outputPath);
            console.log(`[PACKAGE COMPLETE] ${intunewinFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            
            // Save package info
            const packageInfo = {
                id: packageId,
                created: new Date().toISOString(),
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
                filename: intunewinFile,
                path: outputPath,
                fileCount: uploadedFiles.length,
                setupFile,
                uploadedFiles,
                totalSize,
                packageSize: stats.size
            };
            
            await savePackageInfo(packageInfo);
            await logPackageCreation(packageInfo, req);
            
            // Clean up source directory to save space
            await fs.rm(sourceDir, { recursive: true, force: true });
            console.log('[CLEANUP] Source directory removed');
            
            res.json({ 
                downloadUrl: `/api/download/${packageId}`,
                packageId,
                message: 'Package created successfully'
            });
        });
        
    } catch (error) {
        console.error('[ERROR]', error);
        
        // Clean up temp files on error
        for (const file of tempFiles) {
            try {
                await fs.unlink(file.path);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// Download endpoint
app.get('/api/download/:id', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`[DOWNLOAD REQUEST] Package: ${req.params.id}, IP: ${ip}`);
    
    try {
        const packageInfo = await getPackageInfo(req.params.id);
        
        if (!packageInfo) {
            console.log(`[DOWNLOAD ERROR] Package not found: ${req.params.id}`);
            return res.status(404).json({ error: 'Package not found' });
        }
        
        // Check if expired
        if (new Date() > new Date(packageInfo.expires)) {
            console.log(`[DOWNLOAD ERROR] Package expired: ${req.params.id}`);
            return res.status(410).json({ error: 'Download link has expired' });
        }
        
        // Check if file still exists
        try {
            await fs.access(packageInfo.path);
        } catch (error) {
            console.log(`[DOWNLOAD ERROR] File not found: ${packageInfo.path}`);
            return res.status(404).json({ error: 'Package file not found' });
        }
        
        console.log(`[DOWNLOAD SUCCESS] Serving: ${packageInfo.filename}`);
        
        // Send file
        res.download(packageInfo.path, packageInfo.filename);
        
    } catch (error) {
        console.error('[DOWNLOAD ERROR]', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Get package info endpoint
app.get('/api/package/:id', async (req, res) => {
    try {
        const packageInfo = await getPackageInfo(req.params.id);
        
        if (!packageInfo) {
            return res.status(404).json({ error: 'Package not found' });
        }
        
        // Don't send the file path for security
        const { path, ...safeInfo } = packageInfo;
        res.json(safeInfo);
        
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// Cleanup function for expired packages
async function cleanupExpiredPackages() {
    console.log('[CLEANUP] Running cleanup task...');
    
    try {
        const db = await loadDatabase();
        const now = new Date();
        const expiredPackages = db.packages.filter(pkg => new Date(pkg.expires) < now);
        
        for (const pkg of expiredPackages) {
            try {
                // Remove package directory
                const packageDir = path.join('packages', pkg.id);
                await fs.rm(packageDir, { recursive: true, force: true });
                
                // Remove from database
                await removePackageInfo(pkg.id);
                
                console.log(`[CLEANUP] Removed expired package: ${pkg.id}`);
            } catch (error) {
                console.error(`[CLEANUP ERROR] Package ${pkg.id}:`, error);
            }
        }
        
        console.log(`[CLEANUP] Completed. Removed ${expiredPackages.length} expired packages.`);
    } catch (error) {
        console.error('[CLEANUP ERROR]', error);
    }
}

// Schedule cleanup to run every hour
cron.schedule('0 * * * *', cleanupExpiredPackages);

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
                error: 'File too large', 
                details: 'Maximum file size is 1GB' 
            });
        }
    }
    console.error('[UNHANDLED ERROR]', error);
    res.status(500).json({ error: 'Server error', details: error.message });
});

// Start server
async function startServer() {
    try {
        await ensureDirectories();
        
        app.listen(PORT, () => {
            console.log(`\n===============================================`);
            console.log(`Win32 Content Packager Server`);
            console.log(`===============================================`);
            console.log(`Server running on: http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Max file size: 1GB`);
            console.log(`Package expiry: 24 hours`);
            console.log(`===============================================\n`);
            
            // Run initial cleanup
            cleanupExpiredPackages();
        });
    } catch (error) {
        console.error('[STARTUP ERROR]', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Shutting down server...');
    process.exit(0);
});

startServer();