/**
 * Sensor Dashboard Server - DEV1 VERSION
 * שרת לאגירת נתוני חיישנים ואינטגרציה עם Tuya Cloud
 * 
 * גרסת פיתוח - פורט 3002
 * http://localhost:3002/
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
// Configuration - DEV1 (Port 3002)
// ========================================
const CONFIG = {
    PORT: 3002,  // DEV1 - Changed from 3001
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
    electricity: { 
        current: 0, // Current power in Watts
        monthly: 0, // Monthly consumption estimate
        daily: [], 
        lastUpdate: null,
        totalEnergy: 0, // Total accumulated kWh
        todayEnergy: 0, // Today's consumption kWh
        voltage: 0, // Current voltage
        channel1: { power: 0, energy: 0 },
        channel2: { power: 0, energy: 0 }
    },
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
        // Deep merge for nested objects
        if (newSettings.tuya) {
            settings.tuya = settings.tuya || {};
            settings.tuya.accessId = newSettings.tuya.accessId !== undefined ? newSettings.tuya.accessId : settings.tuya.accessId;
            settings.tuya.accessSecret = newSettings.tuya.accessSecret !== undefined ? newSettings.tuya.accessSecret : settings.tuya.accessSecret;
            if (newSettings.tuya.devices) {
                settings.tuya.devices = settings.tuya.devices || {};
                Object.keys(newSettings.tuya.devices).forEach(key => {
                    settings.tuya.devices[key] = newSettings.tuya.devices[key];
                });
            }
        }
        
        // Merge other top-level settings
        if (newSettings.TARGETS) settings.TARGETS = newSettings.TARGETS;
        if (newSettings.ALERTS_ENABLED !== undefined) settings.ALERTS_ENABLED = newSettings.ALERTS_ENABLED;
        if (newSettings.TEMP_ALERT_LOW !== undefined) settings.TEMP_ALERT_LOW = newSettings.TEMP_ALERT_LOW;
        if (newSettings.TEMP_ALERT_HIGH !== undefined) settings.TEMP_ALERT_HIGH = newSettings.TEMP_ALERT_HIGH;
        if (newSettings.UPDATE_INTERVAL !== undefined) settings.UPDATE_INTERVAL = newSettings.UPDATE_INTERVAL;
        
        fs.writeFileSync(CONFIG.SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log('✓ הגדרות נשמרו לקובץ:', CONFIG.SETTINGS_FILE);
        console.log('📋 תוכן:', JSON.stringify(settings.tuya?.devices, null, 2));
        return true;
    } catch (e) {
        console.error('שגיאה בשמירת הגדרות:', e.message);
        return false;
    }
}

// ========================================
// Tuya Cloud API Integration (Fixed Signature)
// ========================================
class TuyaAPI {
    constructor(accessId, accessSecret, baseUrl) {
        this.accessId = accessId;
        this.accessSecret = accessSecret;
        this.baseUrl = baseUrl;
        this.token = null;
        this.tokenExpiry = 0;
    }

    // Generate signature for Tuya API (corrected algorithm)
    calcSign(str, secret) {
        return crypto.createHmac('sha256', secret)
            .update(str, 'utf8')
            .digest('hex')
            .toUpperCase();
    }

    // Get access token
    async getToken() {
        if (this.token && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        const timestamp = Date.now().toString();
        const path = '/v1.0/token?grant_type=1';
        const contentHash = crypto.createHash('sha256').update('').digest('hex');
        
        // String to sign for token request (no token in signature)
        const stringToSign = [
            'GET',
            contentHash,
            '',
            path
        ].join('\n');
        
        const signStr = this.accessId + timestamp + stringToSign;
        const sign = this.calcSign(signStr, this.accessSecret);

        return new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl + path);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'client_id': this.accessId,
                    't': timestamp,
                    'sign': sign,
                    'sign_method': 'HMAC-SHA256'
                }
            };

            console.log('🔐 Token request to:', url.href);

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        console.log('🔐 Token response:', JSON.stringify(result));
                        if (result.success && result.result) {
                            this.token = result.result.access_token;
                            this.tokenExpiry = Date.now() + (result.result.expire_time * 1000) - 60000;
                            console.log('✅ Token obtained successfully!');
                            resolve(this.token);
                        } else {
                            console.log('❌ Token error:', result.msg);
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

    // Generic API request
    async apiRequest(path) {
        try {
            const token = await this.getToken();
            const timestamp = Date.now().toString();
            const contentHash = crypto.createHash('sha256').update('').digest('hex');
            
            const stringToSign = [
                'GET',
                contentHash,
                '',
                path
            ].join('\n');
            
            const signStr = this.accessId + token + timestamp + stringToSign;
            const sign = this.calcSign(signStr, this.accessSecret);

            return new Promise((resolve, reject) => {
                const url = new URL(this.baseUrl + path);
                
                const options = {
                    hostname: url.hostname,
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: {
                        'client_id': this.accessId,
                        'access_token': token,
                        't': timestamp,
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
            console.error(`API request error for ${path}:`, e.message);
            return null;
        }
    }
    
    // Get device status
    async getDeviceStatus(deviceId) {
        if (!deviceId) return null;
        return this.apiRequest(`/v1.0/devices/${deviceId}/status`);
    }
    
    // Get device info
    async getDeviceInfo(deviceId) {
        if (!deviceId) return null;
        return this.apiRequest(`/v1.0/devices/${deviceId}`);
    }
    
    // Get device statistics for energy meter
    async getDeviceStatistics(deviceId, dpCode = 'forward_energy_total') {
        if (!deviceId) return null;
        return this.apiRequest(`/v1.0/devices/${deviceId}/statistics?code=${dpCode}&type=1`);
    }
    
    // Get device specifications
    async getDeviceSpecifications(deviceId) {
        if (!deviceId) return null;
        return this.apiRequest(`/v1.0/devices/${deviceId}/specifications`);
    }
    
    // Get Thing Model properties (newer API)
    async getThingProperties(deviceId) {
        if (!deviceId) return null;
        return this.apiRequest(`/v2.0/cloud/thing/${deviceId}/shadow/properties`);
    }
    
    // Get device DP commands result
    async getDeviceCommands(deviceId) {
        if (!deviceId) return null;
        return this.apiRequest(`/v1.0/iot-03/devices/${deviceId}/status`);
    }
    
    // Get device logs
    async getDeviceLogs(deviceId, startTime, endTime) {
        if (!deviceId) return null;
        const start = startTime || (Date.now() - 3600000); // Last hour
        const end = endTime || Date.now();
        return this.apiRequest(`/v1.0/devices/${deviceId}/logs?type=7&start_time=${start}&end_time=${end}&size=10`);
    }
    
    // Issue a DP command to force device report
    async issueCommand(deviceId, commands) {
        if (!deviceId) return null;
        
        try {
            const token = await this.getToken();
            const timestamp = Date.now().toString();
            const path = `/v1.0/devices/${deviceId}/commands`;
            const body = JSON.stringify({ commands });
            const contentHash = crypto.createHash('sha256').update(body).digest('hex');
            
            const stringToSign = [
                'POST',
                contentHash,
                '',
                path
            ].join('\n');
            
            const signStr = this.accessId + token + timestamp + stringToSign;
            const sign = this.calcSign(signStr, this.accessSecret);

            return new Promise((resolve, reject) => {
                const url = new URL(this.baseUrl + path);
                
                const options = {
                    hostname: url.hostname,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'client_id': this.accessId,
                        'access_token': token,
                        't': timestamp,
                        'sign': sign,
                        'sign_method': 'HMAC-SHA256',
                        'Content-Type': 'application/json'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.on('error', reject);
                req.write(body);
                req.end();
            });
        } catch (e) {
            console.error(`Command error for ${deviceId}:`, e.message);
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
    
    let gotRealData = false;
    
    if (tuyaClient) {
        // Real Tuya API calls
        try {
            console.log('📡 מנסה להתחבר ל-Tuya...');
            
            // === Temperature sensor ===
            if (CONFIG.TUYA.DEVICES.TEMPERATURE) {
                const tempStatus = await tuyaClient.getDeviceStatus(CONFIG.TUYA.DEVICES.TEMPERATURE);
                
                if (tempStatus?.result && Array.isArray(tempStatus.result)) {
                    gotRealData = true;
                    
                    // Parse temperature
                    const temp = findDPValue(tempStatus.result, ['temp_current', 'temperature', 'temp', 'va_temperature', 'temp_value']);
                    if (temp !== null) {
                        sensorData.temperature.current = temp > 100 ? temp / 10 : temp;
                        console.log('✅ טמפרטורה:', sensorData.temperature.current, '°C');
                    }
                    
                    // The temperature sensor also has power data - could be used if needed
                    const voltage = findDPValue(tempStatus.result, ['cur_voltage']);
                    if (voltage !== null) {
                        console.log('   מתח:', voltage / 10, 'V');
                    }
                } else {
                    console.log('⚠️ טמפרטורה - לא התקבלו נתונים:', tempStatus?.msg || 'unknown');
                }
            }
            
            // === Electricity meter (Dual CT clamp) ===
            if (CONFIG.TUYA.DEVICES.ELECTRICITY) {
                const elecDeviceId = CONFIG.TUYA.DEVICES.ELECTRICITY;
                
                // Use Thing Model API for Double Digital Meter
                const thingProps = await tuyaClient.getThingProperties(elecDeviceId);
                
                if (thingProps?.success && thingProps?.result?.properties) {
                    gotRealData = true;
                    const props = thingProps.result.properties;
                    
                    // Parse dual channel meter data
                    const getVal = (code) => {
                        const p = props.find(x => x.code === code);
                        return p ? p.value : 0;
                    };
                    
                    // Power values (in 0.1W, so divide by 10)
                    const power1 = getVal('cur_power1') / 10;
                    const power2 = getVal('cur_power2') / 10;
                    const totalPower = power1 + power2;
                    
                    // Energy values (in 0.01 kWh for total, 0.01 kWh for today)
                    const totalEnergy = getVal('all_energy') / 100;
                    const todayEnergy1 = getVal('today_acc_energy1') / 100;
                    const todayEnergy2 = getVal('today_acc_energy2') / 100;
                    const todayEnergy = todayEnergy1 + todayEnergy2;
                    
                    // Voltage (in 0.1V)
                    const voltage = getVal('cur_voltage1') / 10;
                    
                    // Update sensor data
                    sensorData.electricity.current = Math.round(totalPower);
                    sensorData.electricity.totalEnergy = totalEnergy;
                    sensorData.electricity.todayEnergy = todayEnergy;
                    sensorData.electricity.voltage = voltage;
                    sensorData.electricity.channel1 = { power: power1, energy: getVal('total_energy1') / 100 };
                    sensorData.electricity.channel2 = { power: power2, energy: getVal('total_energy2') / 100 };
                    
                    console.log('✅ חשמל מעודכן:');
                    console.log(`   הספק נוכחי: ${totalPower.toFixed(1)}W (ערוץ1: ${power1.toFixed(1)}W, ערוץ2: ${power2.toFixed(1)}W)`);
                    console.log(`   צריכה היום: ${todayEnergy.toFixed(2)} kWh`);
                    console.log(`   צריכה כוללת: ${totalEnergy.toFixed(2)} kWh`);
                    console.log(`   מתח: ${voltage.toFixed(1)}V`);
                } else {
                    console.log('⚡ לא הצלחתי לקבל נתוני חשמל:', thingProps?.msg || 'unknown');
                }
            }
            
            if (gotRealData) {
                console.log('✅ התקבלו נתונים אמיתיים מ-Tuya!');
            } else {
                console.log('⚠️ לא התקבלו נתונים מ-Tuya');
            }
            
        } catch (e) {
            console.error('❌ שגיאה בחיבור ל-Tuya:', e.message);
        }
    }
    
    // Only simulate for devices WITHOUT Device IDs, or if Tuya failed completely
    if (!gotRealData) {
        simulateSensorData();
    } else {
        // Set zeros for unconfigured sensors (gas/water)
        if (!CONFIG.TUYA.DEVICES.GAS) sensorData.gas.current = 0;
        if (!CONFIG.TUYA.DEVICES.WATER) sensorData.water.current = 0;
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

// Try multiple DP codes to find a value
function findDPValue(statusArray, dpCodes) {
    if (!Array.isArray(statusArray)) return null;
    for (const code of dpCodes) {
        const dp = statusArray.find(s => s.code === code);
        if (dp && dp.value !== undefined) {
            return dp.value;
        }
    }
    // If no specific code found, try to find any numeric value
    for (const dp of statusArray) {
        if (typeof dp.value === 'number') {
            console.log(`  📊 נמצא DP: ${dp.code} = ${dp.value}`);
            return dp.value;
        }
    }
    return null;
}

function simulateSensorData() {
    // Only simulate sensors that have Device IDs configured
    // Sensors without Device IDs stay at 0
    if (CONFIG.TUYA.DEVICES.GAS) {
        sensorData.gas.current = (Math.random() * 2).toFixed(2);
    } else {
        sensorData.gas.current = 0;
    }
    
    if (CONFIG.TUYA.DEVICES.WATER) {
        sensorData.water.current = (Math.random() * 15).toFixed(1);
    } else {
        sensorData.water.current = 0;
    }
    
    if (CONFIG.TUYA.DEVICES.ELECTRICITY) {
        sensorData.electricity.current = Math.floor(500 + Math.random() * 2500);
    } else {
        sensorData.electricity.current = 0;
    }
    
    if (CONFIG.TUYA.DEVICES.TEMPERATURE) {
        sensorData.temperature.current = Math.floor(45 + Math.random() * 25);
    } else {
        sensorData.temperature.current = 0;
    }
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
        
        // Daily data for charts (last 30 days)
        const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
        sensorData[type].daily = [];
        
        for (let i = 29; i >= 0; i--) {
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
                // Only generate demo data for sensors with Device IDs configured
                const deviceKey = type.toUpperCase();
                if (CONFIG.TUYA.DEVICES[deviceKey]) {
                    if (type === 'gas') dayValue = 1 + Math.random() * 3;
                    else if (type === 'water') dayValue = 0.3 + Math.random() * 0.8;
                    else if (type === 'electricity') dayValue = 10 + Math.random() * 25;
                }
                // If no Device ID, dayValue stays at 0
            }
            
            sensorData[type].daily.push({
                day: days[date.getDay()],
                dateStr: date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
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
    
    // Temperature daily chart - aggregate from history (last 30 days)
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    sensorData.temperature.daily = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        
        const dayEntries = historyData.temperature.filter(h => {
            const t = new Date(h.timestamp);
            return t >= dayStart && t < dayEnd;
        });
        
        let tempValue = 0;
        if (dayEntries.length > 0) {
            tempValue = dayEntries.reduce((sum, e) => sum + e.value, 0) / dayEntries.length;
        } else if (CONFIG.TUYA.DEVICES.TEMPERATURE) {
            tempValue = sensorData.temperature.current || (50 + Math.random() * 15);
        }
        
        sensorData.temperature.daily.push({
            day: days[date.getDay()],
            dateStr: date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
            value: tempValue
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
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host}`);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'כתובת URL לא תקינה' }));
        return;
    }
    
    // API Routes
    if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            success: true,
            status: 'running',
            version: 'dev1',
            uptime: process.uptime(),
            tuyaConnected: !!tuyaClient,
            configuredDevices: {
                gas: !!CONFIG.TUYA.DEVICES.GAS,
                water: !!CONFIG.TUYA.DEVICES.WATER,
                electricity: !!CONFIG.TUYA.DEVICES.ELECTRICITY,
                temperature: !!CONFIG.TUYA.DEVICES.TEMPERATURE
            },
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
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
        const days = Math.min(Math.max(parseInt(url.searchParams.get('days')) || 7, 1), 90);
        
        // Validate type parameter
        const validTypes = ['all', 'gas', 'water', 'electricity', 'temperature'];
        if (!validTypes.includes(type)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'סוג חיישן לא תקין' }));
            return;
        }
        
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
    
    // GET settings
    if (url.pathname === '/api/settings' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, settings: settings }));
        return;
    }
    
    if (url.pathname === '/api/settings' && req.method === 'POST') {
        let body = '';
        let bodyTooLarge = false;
        const MAX_BODY_SIZE = 10 * 1024; // 10KB limit
        req.on('data', chunk => {
            body += chunk;
            if (body.length > MAX_BODY_SIZE) {
                bodyTooLarge = true;
                res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'גוף הבקשה גדול מדי' }));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (bodyTooLarge) return;
            try {
                const newSettings = JSON.parse(body);
                console.log('📥 מקבל הגדרות חדשות:', JSON.stringify(newSettings, null, 2));
                
                const success = saveSettings(newSettings);
                
                // Reinitialize Tuya client with new settings
                if (newSettings.tuya) {
                    // Use nullish coalescing - only use old value if new is undefined/null
                    CONFIG.TUYA.ACCESS_ID = newSettings.tuya.accessId !== undefined ? newSettings.tuya.accessId : CONFIG.TUYA.ACCESS_ID;
                    CONFIG.TUYA.ACCESS_SECRET = newSettings.tuya.accessSecret !== undefined ? newSettings.tuya.accessSecret : CONFIG.TUYA.ACCESS_SECRET;
                    
                    if (newSettings.tuya.devices) {
                        const oldDevices = { ...CONFIG.TUYA.DEVICES };
                        
                        // Replace devices entirely to support clearing
                        CONFIG.TUYA.DEVICES = {
                            GAS: newSettings.tuya.devices.GAS !== undefined ? newSettings.tuya.devices.GAS : CONFIG.TUYA.DEVICES.GAS,
                            WATER: newSettings.tuya.devices.WATER !== undefined ? newSettings.tuya.devices.WATER : CONFIG.TUYA.DEVICES.WATER,
                            ELECTRICITY: newSettings.tuya.devices.ELECTRICITY !== undefined ? newSettings.tuya.devices.ELECTRICITY : CONFIG.TUYA.DEVICES.ELECTRICITY,
                            TEMPERATURE: newSettings.tuya.devices.TEMPERATURE !== undefined ? newSettings.tuya.devices.TEMPERATURE : CONFIG.TUYA.DEVICES.TEMPERATURE
                        };
                        
                        // Reset sensor data for removed devices
                        if (oldDevices.GAS && !CONFIG.TUYA.DEVICES.GAS) {
                            console.log('🗑️ מאפס נתוני גז - Device ID הוסר');
                            sensorData.gas = { current: 0, monthly: 0, daily: sensorData.gas.daily, lastUpdate: null };
                        }
                        if (oldDevices.WATER && !CONFIG.TUYA.DEVICES.WATER) {
                            console.log('🗑️ מאפס נתוני מים - Device ID הוסר');
                            sensorData.water = { current: 0, monthly: 0, daily: sensorData.water.daily, lastUpdate: null };
                        }
                        if (oldDevices.ELECTRICITY && !CONFIG.TUYA.DEVICES.ELECTRICITY) {
                            console.log('🗑️ מאפס נתוני חשמל - Device ID הוסר');
                            sensorData.electricity = { current: 0, monthly: 0, daily: sensorData.electricity.daily, lastUpdate: null, totalEnergy: 0, todayEnergy: 0, voltage: 0, channel1: { power: 0, energy: 0 }, channel2: { power: 0, energy: 0 } };
                        }
                        if (oldDevices.TEMPERATURE && !CONFIG.TUYA.DEVICES.TEMPERATURE) {
                            console.log('🗑️ מאפס נתוני טמפרטורה - Device ID הוסר');
                            sensorData.temperature = { current: 0, average: 0, daily: sensorData.temperature.daily, lastUpdate: null };
                        }
                        
                        // Save updated sensor data
                        saveData();
                    }
                    
                    console.log('🔄 מעדכן הגדרות Tuya:', CONFIG.TUYA.DEVICES);
                    initTuyaClient();
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success, message: success ? 'הגדרות נשמרו' : 'שגיאה בשמירה' }));
            } catch (e) {
                console.error('❌ שגיאה בשמירת הגדרות:', e);
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
    
    if (url.pathname === '/api/reset' && req.method === 'POST') {
        // Reset all sensor data
        sensorData = {
            gas: { current: 0, monthly: 0, daily: [], lastUpdate: null },
            water: { current: 0, monthly: 0, daily: [], lastUpdate: null },
            electricity: { 
                current: 0, monthly: 0, daily: [], lastUpdate: null,
                totalEnergy: 0, todayEnergy: 0, voltage: 0,
                channel1: { power: 0, energy: 0 },
                channel2: { power: 0, energy: 0 }
            },
            temperature: { current: 0, average: 0, daily: [], lastUpdate: null }
        };
        
        // Reset history
        historyData = {
            gas: [],
            water: [],
            electricity: [],
            temperature: []
        };
        
        // Save to disk
        saveData();
        
        console.log('🔄 כל הנתונים אופסו');
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'כל הנתונים אופסו בהצלחה' }));
        return;
    }
    
    // Serve static files
    let filePath = url.pathname === '/' ? '/sensor_dashboard.html' : url.pathname;
    filePath = path.join(__dirname, filePath);
    
    // Path traversal protection
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 - גישה נדחתה</h1>', 'utf-8');
        return;
    }
    
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
// Start Server - DEV1 (Port 3002)
// ========================================
function start() {
    console.log('🚀 מתחיל שרת דשבורד חיישנים - DEV1...');
    console.log('================================');
    console.log('📁 תיקייה: Sensor_Dashboard_Dev1');
    console.log('🔌 פורט: 3002');
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
        console.log(`✓ בדיקת בריאות: http://localhost:${CONFIG.PORT}/api/health`);
        console.log('================================');
        console.log('💡 לחיבור Tuya, הגדר את המשתנים:');
        console.log('   TUYA_ACCESS_ID, TUYA_ACCESS_SECRET');
        console.log('   ו-Device IDs לכל חיישן');
        console.log('================================');
    });
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ פורט ${CONFIG.PORT} תפוס! נסה לסגור את התהליך שמשתמש בו או שנה את הפורט.`);
        } else {
            console.error('❌ שגיאת שרת:', err.message);
        }
        process.exit(1);
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
