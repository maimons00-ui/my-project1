/**
 * Sensor Dashboard Server
 * שרת לאגירת נתוני חיישנים ואינטגרציה עם Tuya Cloud
 * 
 * התקנה: npm install
 * הפעלה: npm start
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ========================================
// Configuration
// ========================================
const CONFIG = {
    PORT: 3000,
    DATA_FILE: path.join(__dirname, 'sensor_data.json'),
    HISTORY_FILE: path.join(__dirname, 'sensor_history.json'),
    SETTINGS_FILE: path.join(__dirname, 'settings.json'),
    
    // Tuya API Configuration (set via settings or environment variables)
    TUYA: {
        ACCESS_ID: process.env.TUYA_ACCESS_ID || '',
        ACCESS_SECRET: process.env.TUYA_ACCESS_SECRET || '',
        BASE_URL: process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com', // EU region
        DEVICES: {
            GAS: process.env.TUYA_GAS_DEVICE_ID || '',
            WATER: process.env.TUYA_WATER_DEVICE_ID || '',
            ELECTRICITY: process.env.TUYA_ELECTRICITY_DEVICE_ID || '',
            TEMPERATURE: process.env.TUYA_TEMPERATURE_DEVICE_ID || ''
        }
    },
    
    // Polling interval in milliseconds
    POLL_INTERVAL: 30000, // 30 seconds
    
    // Monthly targets
    TARGETS: {
        gas: 50,      // m³
        water: 15,    // m³  
        electricity: 500 // kWh
    }
};

// ========================================
// Data Storage
// ========================================
let sensorData = {
    gas: { current: 0, monthly: 0, daily: [], lastUpdate: null },
    water: { current: 0, monthly: 0, daily: [], lastUpdate: null },
    electricity: { current: 0, monthly: 0, daily: [], lastUpdate: null },
    temperature: { current: 0, average: 0, daily: [], lastUpdate: null }
};

let historyData = {
    gas: [],
    water: [],
    electricity: [],
    temperature: []
};

let settings = {};

// ========================================
// File Operations
// ========================================
function loadData() {
    try {
        if (fs.existsSync(CONFIG.DATA_FILE)) {
            sensorData = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
            console.log('✓ נתוני חיישנים נטענו');
        }
        
        if (fs.existsSync(CONFIG.HISTORY_FILE)) {
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
            console.log('✓ היסטוריה נטענה');
        }
        
        if (fs.existsSync(CONFIG.SETTINGS_FILE)) {
            settings = JSON.parse(fs.readFileSync(CONFIG.SETTINGS_FILE, 'utf8'));
            // Update CONFIG with loaded settings
            if (settings.tuya) {
                CONFIG.TUYA.ACCESS_ID = settings.tuya.accessId || CONFIG.TUYA.ACCESS_ID;
                CONFIG.TUYA.ACCESS_SECRET = settings.tuya.accessSecret || CONFIG.TUYA.ACCESS_SECRET;
                if (settings.tuya.devices) {
                    CONFIG.TUYA.DEVICES = { ...CONFIG.TUYA.DEVICES, ...settings.tuya.devices };
                }
            }
            console.log('✓ הגדרות נטענו');
        }
    } catch (e) {
        console.error('שגיאה בטעינת נתונים:', e.message);
    }
}

function saveData() {
    try {
        fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(sensorData, null, 2));
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
    } catch (e) {
        console.error('שגיאה בשמירת נתונים:', e.message);
    }
}

function saveSettings(newSettings) {
    try {
        settings = { ...settings, ...newSettings };
        fs.writeFileSync(CONFIG.SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log('✓ הגדרות נשמרו');
        return true;
    } catch (e) {
        console.error('שגיאה בשמירת הגדרות:', e.message);
        return false;
    }
}

// ========================================
// Tuya Cloud API Integration
// ========================================
class TuyaAPI {
    constructor(accessId, accessSecret, baseUrl) {
        this.accessId = accessId;
        this.accessSecret = accessSecret;
        this.baseUrl = baseUrl;
        this.token = null;
        this.tokenExpiry = 0;
    }

    // Generate signature for Tuya API
    generateSign(timestamp, nonce, signStr) {
        const str = this.accessId + timestamp + nonce + signStr;
        return crypto.createHmac('sha256', this.accessSecret)
            .update(str)
            .digest('hex')
            .toUpperCase();
    }

    // Get access token
    async getToken() {
        if (this.token && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const signStr = 'GET\n' + 
            crypto.createHash('sha256').update('').digest('hex') + '\n\n' +
            '/v1.0/token?grant_type=1';
        
        const sign = this.generateSign(timestamp, nonce, signStr);

        return new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl + '/v1.0/token?grant_type=1');
            
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'client_id': this.accessId,
                    't': timestamp,
                    'nonce': nonce,
                    'sign': sign,
                    'sign_method': 'HMAC-SHA256'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.success && result.result) {
                            this.token = result.result.access_token;
                            this.tokenExpiry = Date.now() + (result.result.expire_time * 1000) - 60000;
                            resolve(this.token);
                        } else {
                            reject(new Error(result.msg || 'Failed to get token'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    // Get device status
    async getDeviceStatus(deviceId) {
        if (!deviceId) return null;
        
        try {
            const token = await this.getToken();
            const timestamp = Date.now().toString();
            const nonce = crypto.randomBytes(16).toString('hex');
            const path = `/v1.0/devices/${deviceId}/status`;
            
            const signStr = 'GET\n' + 
                crypto.createHash('sha256').update('').digest('hex') + '\n\n' +
                path;
            
            const sign = this.generateSign(timestamp, nonce, token + signStr);

            return new Promise((resolve, reject) => {
                const url = new URL(this.baseUrl + path);
                
                const options = {
                    hostname: url.hostname,
                    path: url.pathname,
                    method: 'GET',
                    headers: {
                        'client_id': this.accessId,
                        'access_token': token,
                        't': timestamp,
                        'nonce': nonce,
                        'sign': sign,
                        'sign_method': 'HMAC-SHA256'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            resolve(result);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });
        } catch (e) {
            console.error(`Error getting device ${deviceId} status:`, e.message);
            return null;
        }
    }
}

// ========================================
// Sensor Data Processing
// ========================================
let tuyaClient = null;

function initTuyaClient() {
    if (CONFIG.TUYA.ACCESS_ID && CONFIG.TUYA.ACCESS_SECRET) {
        tuyaClient = new TuyaAPI(
            CONFIG.TUYA.ACCESS_ID,
            CONFIG.TUYA.ACCESS_SECRET,
            CONFIG.TUYA.BASE_URL
        );
        console.log('✓ Tuya client initialized');
        return true;
    }
    console.log('⚠ Tuya credentials not configured - using simulation mode');
    return false;
}

async function fetchSensorData() {
    const now = new Date();
    const timestamp = now.toISOString();
    
    if (tuyaClient) {
        // Real Tuya API calls
        try {
            const [gasStatus, waterStatus, elecStatus, tempStatus] = await Promise.all([
                tuyaClient.getDeviceStatus(CONFIG.TUYA.DEVICES.GAS),
                tuyaClient.getDeviceStatus(CONFIG.TUYA.DEVICES.WATER),
                tuyaClient.getDeviceStatus(CONFIG.TUYA.DEVICES.ELECTRICITY),
                tuyaClient.getDeviceStatus(CONFIG.TUYA.DEVICES.TEMPERATURE)
            ]);

            // Parse device responses based on your specific Tuya device types
            // This parsing depends on your actual device data points (DPs)
            if (gasStatus?.result) {
                sensorData.gas.current = parseDeviceValue(gasStatus.result, 'cur_current') || sensorData.gas.current;
            }
            if (waterStatus?.result) {
                sensorData.water.current = parseDeviceValue(waterStatus.result, 'cur_current') || sensorData.water.current;
            }
            if (elecStatus?.result) {
                sensorData.electricity.current = parseDeviceValue(elecStatus.result, 'cur_power') || sensorData.electricity.current;
            }
            if (tempStatus?.result) {
                sensorData.temperature.current = parseDeviceValue(tempStatus.result, 'temp_current') || sensorData.temperature.current;
            }
        } catch (e) {
            console.error('Error fetching from Tuya:', e.message);
            // Fall back to simulation
            simulateSensorData();
        }
    } else {
        // Simulation mode
        simulateSensorData();
    }
    
    // Update timestamps
    const updateTime = now.toLocaleTimeString('he-IL');
    sensorData.gas.lastUpdate = updateTime;
    sensorData.water.lastUpdate = updateTime;
    sensorData.electricity.lastUpdate = updateTime;
    sensorData.temperature.lastUpdate = updateTime;
    
    // Record history
    recordHistory(timestamp);
    
    // Calculate monthly totals and daily averages
    calculateAggregates();
    
    // Save to disk
    saveData();
}

function parseDeviceValue(statusArray, dpCode) {
    if (!Array.isArray(statusArray)) return null;
    const dp = statusArray.find(s => s.code === dpCode);
    return dp ? dp.value : null;
}

function simulateSensorData() {
    // Generate realistic sensor values for demo
    sensorData.gas.current = (Math.random() * 2).toFixed(2);
    sensorData.water.current = (Math.random() * 15).toFixed(1);
    sensorData.electricity.current = Math.floor(500 + Math.random() * 2500);
    sensorData.temperature.current = Math.floor(45 + Math.random() * 25);
}

function recordHistory(timestamp) {
    const entry = {
        timestamp,
        gas: parseFloat(sensorData.gas.current),
        water: parseFloat(sensorData.water.current),
        electricity: parseFloat(sensorData.electricity.current),
        temperature: parseFloat(sensorData.temperature.current)
    };
    
    // Add to history arrays
    ['gas', 'water', 'electricity', 'temperature'].forEach(type => {
        historyData[type].push({
            timestamp,
            value: entry[type]
        });
        
        // Keep only last 30 days of detailed history
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        historyData[type] = historyData[type].filter(h => 
            new Date(h.timestamp).getTime() > thirtyDaysAgo
        );
    });
}

function calculateAggregates() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    ['gas', 'water', 'electricity'].forEach(type => {
        // Monthly total (simplified - in real app, accumulate from meter readings)
        const monthlyEntries = historyData[type].filter(h => 
            new Date(h.timestamp) >= startOfMonth
        );
        
        if (monthlyEntries.length > 0) {
            // For consumption sensors, sum up readings weighted by time interval
            const avgValue = monthlyEntries.reduce((sum, e) => sum + e.value, 0) / monthlyEntries.length;
            const dayOfMonth = now.getDate();
            
            // Estimate monthly consumption based on average reading
            if (type === 'gas') {
                sensorData.gas.monthly = (dayOfMonth * avgValue * 0.05).toFixed(1);
            } else if (type === 'water') {
                sensorData.water.monthly = (dayOfMonth * avgValue * 0.02).toFixed(2);
            } else if (type === 'electricity') {
                sensorData.electricity.monthly = Math.floor(dayOfMonth * avgValue * 0.01);
            }
        }
        
        // Daily data for charts (last 7 days)
        const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
        sensorData[type].daily = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            
            const dayEntries = historyData[type].filter(h => {
                const t = new Date(h.timestamp);
                return t >= dayStart && t < dayEnd;
            });
            
            let dayValue = 0;
            if (dayEntries.length > 0) {
                dayValue = dayEntries.reduce((sum, e) => sum + e.value, 0) / dayEntries.length;
                if (type === 'gas') dayValue *= 0.5;
                else if (type === 'water') dayValue *= 0.1;
                else if (type === 'electricity') dayValue *= 0.01;
            } else {
                // Generate some demo data for empty days
                if (type === 'gas') dayValue = 1 + Math.random() * 3;
                else if (type === 'water') dayValue = 0.3 + Math.random() * 0.8;
                else if (type === 'electricity') dayValue = 10 + Math.random() * 25;
            }
            
            sensorData[type].daily.push({
                day: days[date.getDay()],
                value: dayValue
            });
        }
    });
    
    // Temperature average
    const todayTempEntries = historyData.temperature.filter(h => 
        new Date(h.timestamp) >= startOfDay
    );
    if (todayTempEntries.length > 0) {
        sensorData.temperature.average = Math.floor(
            todayTempEntries.reduce((sum, e) => sum + e.value, 0) / todayTempEntries.length
        );
    }
    
    // Temperature daily chart
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    sensorData.temperature.daily = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        sensorData.temperature.daily.push({
            day: days[date.getDay()],
            value: 50 + Math.random() * 15
        });
    }
}

// ========================================
// Monthly Reset
// ========================================
function checkMonthlyReset() {
    const now = new Date();
    const resetKey = `${now.getFullYear()}-${now.getMonth()}`;
    
    if (settings.lastMonthlyReset !== resetKey) {
        console.log('📅 איפוס נתונים חודשיים');
        sensorData.gas.monthly = 0;
        sensorData.water.monthly = 0;
        sensorData.electricity.monthly = 0;
        settings.lastMonthlyReset = resetKey;
        saveSettings(settings);
    }
}

// ========================================
// HTTP Server
// ========================================
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // API Routes
    if (url.pathname === '/api/sensors') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            success: true,
            data: sensorData,
            targets: CONFIG.TARGETS,
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
    if (url.pathname === '/api/history') {
        const type = url.searchParams.get('type') || 'all';
        const days = parseInt(url.searchParams.get('days')) || 7;
        
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        let result = {};
        if (type === 'all') {
            ['gas', 'water', 'electricity', 'temperature'].forEach(t => {
                result[t] = historyData[t].filter(h => new Date(h.timestamp).getTime() > cutoff);
            });
        } else if (historyData[type]) {
            result[type] = historyData[type].filter(h => new Date(h.timestamp).getTime() > cutoff);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, data: result }));
        return;
    }
    
    if (url.pathname === '/api/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newSettings = JSON.parse(body);
                const success = saveSettings(newSettings);
                
                // Reinitialize Tuya client with new settings
                if (newSettings.tuya) {
                    CONFIG.TUYA.ACCESS_ID = newSettings.tuya.accessId || CONFIG.TUYA.ACCESS_ID;
                    CONFIG.TUYA.ACCESS_SECRET = newSettings.tuya.accessSecret || CONFIG.TUYA.ACCESS_SECRET;
                    if (newSettings.tuya.devices) {
                        CONFIG.TUYA.DEVICES = { ...CONFIG.TUYA.DEVICES, ...newSettings.tuya.devices };
                    }
                    initTuyaClient();
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success, message: success ? 'הגדרות נשמרו' : 'שגיאה בשמירה' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }
    
    if (url.pathname === '/api/export') {
        const exportData = {
            sensorData,
            historyData,
            exportDate: new Date().toISOString()
        };
        
        res.writeHead(200, { 
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="sensor_export_${new Date().toISOString().split('T')[0]}.json"`
        });
        res.end(JSON.stringify(exportData, null, 2));
        return;
    }
    
    // Serve static files
    let filePath = url.pathname === '/' ? '/sensor_dashboard.html' : url.pathname;
    filePath = path.join(__dirname, filePath);
    
    const extname = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon'
    };
    
    const contentType = contentTypes[extname] || 'text/plain; charset=utf-8';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - קובץ לא נמצא</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// ========================================
// Start Server
// ========================================
function start() {
    console.log('🚀 מתחיל שרת דשבורד חיישנים...');
    console.log('================================');
    
    // Load existing data
    loadData();
    
    // Check for monthly reset
    checkMonthlyReset();
    
    // Initialize Tuya client
    initTuyaClient();
    
    // Initial sensor fetch
    fetchSensorData();
    
    // Set up polling interval
    setInterval(fetchSensorData, CONFIG.POLL_INTERVAL);
    
    // Hourly data save
    setInterval(saveData, 3600000);
    
    // Start HTTP server
    server.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log(`✓ שרת פועל בכתובת: http://localhost:${CONFIG.PORT}`);
        console.log(`✓ API זמין ב: http://localhost:${CONFIG.PORT}/api/sensors`);
        console.log('================================');
        console.log('💡 לחיבור Tuya, הגדר את המשתנים:');
        console.log('   TUYA_ACCESS_ID, TUYA_ACCESS_SECRET');
        console.log('   ו-Device IDs לכל חיישן');
        console.log('================================');
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n💾 שומר נתונים לפני יציאה...');
    saveData();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n💾 שומר נתונים לפני יציאה...');
    saveData();
    process.exit(0);
});

// Start the server
start();
