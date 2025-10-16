// index.js
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const { pathname } = url;

            if (pathname === '/webhook' && request.method === 'POST') {
                return handleTelegramWebhook(request, env);
            }

            //iseng aja nambahin wkwk
            if (pathname === '/health' && request.method === 'GET') {
                return new Response('OK', { status: 200 });
            }

            return new Response('Not Found', { status: 404 });
        } catch (error) {
            console.error('Error:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    },
};

// ======================
// CONFIGURATION
// ======================
const TELEGRAM_BOT_TOKEN = 'xxxxxx';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const ADMIN_IDS = [123456789];
const BOT_NAME = 'Cloudflare DNS Manager';

// ======================
// STATE MANAGEMENT
// ======================
const STATE = {
    MAIN_MENU: 'main_menu',
    AWAITING_EMAIL: 'awaiting_email',
    AWAITING_API_KEY: 'awaiting_api_key',
    MANAGING_ZONES: 'managing_zones',
    ADDING_DOMAIN: 'adding_domain',
    MANAGING_ZONE: 'managing_zone',
    ADDING_DNS_RECORD_TYPE: 'adding_dns_record_type',
    ADDING_DNS_RECORD_NAME: 'adding_dns_record_name',
    ADDING_DNS_RECORD_CONTENT: 'adding_dns_record_content',
    ADDING_DNS_RECORD_PROXIED: 'adding_dns_record_proxied',
    DELETING_DNS_RECORD: 'deleting_dns_record',
    UPDATING_DNS_RECORD: 'updating_dns_record',
    VIEWING_NAMESERVERS: 'viewing_nameservers',
    CONFIRMING_LOGOUT: 'confirming_logout',
    DELETING_DOMAIN: 'deleting_domain',
    CONFIRMING_DOMAIN_DELETE: 'confirming_domain_delete',
    MANAGING_EMAIL_ROUTING: 'managing_email_routing',
    CONFIGURING_EMAIL_RULE: 'configuring_email_rule',
    ADDING_EMAIL_DESTINATION: 'adding_email_destination'
};

// ======================
// ZONE DATA MANAGEMENT
// ======================
async function storeZoneData(env, chatId, zoneId, zoneName) {
    await env.TEST.put(`zone_data_${chatId}`, JSON.stringify({
        id: zoneId,
        name: zoneName
    }));
}

async function getZoneData(env, chatId) {
    const data = await env.TEST.get(`zone_data_${chatId}`);
    return data ? JSON.parse(data) : null;
}

async function clearZoneData(env, chatId) {
    await env.TEST.delete(`zone_data_${chatId}`);
}

// ======================
// KEYBOARD GENERATOR
// ======================
function generateMainMenuWithAuth(authStatus) {
    const buttons = [
        [
            { text: "🌐 List Domains", callback_data: "list_domains" },
            { text: "➕ Add Domain", callback_data: "add_domain" }
        ]
    ];
    
    if (authStatus.isLoggedIn) {
        buttons.push([
            { text: "🔐 Change Credentials", callback_data: "set_credentials" },
            { text: "🚪 Logout", callback_data: "logout" }
        ]);
    } else {
        buttons.push([
            { text: "🔐 Login", callback_data: "set_credentials" }
        ]);
    }
    
    buttons.push([
        { text: "🔄 Refresh", callback_data: "refresh" }
    ]);
    
    return { inline_keyboard: buttons };
}

function generateDNSMenu() {
    return {
        inline_keyboard: [
            [
                { text: "📋 List Records", callback_data: "list_records" },
                { text: "➕ Add Record", callback_data: "add_record" }
            ],
            [
                { text: "🗑 Delete Record", callback_data: "delete_record" },
                { text: "✏️ Update Record", callback_data: "update_record" }
            ],
            [
                { text: "📧 Email Routing", callback_data: "email_routing" },
                { text: "🔐 View SSL Certs", callback_data: "view_ssl" }
            ],
            [
                { text: "🔧 Nameservers", callback_data: "view_nameservers" },
                { text: "❌ Delete Domain", callback_data: "delete_domain" }
            ],
            [
                { text: "⬅️ Back to Domains", callback_data: "list_domains" }
            ]
        ]
    };
}

function generateEmailRoutingMenu(emailRoutingStatus) {
    const isEnabled = emailRoutingStatus?.enabled || false;
    
    const buttons = [
        [
            { 
                text: isEnabled ? "🟢 Email Routing ON" : "🔴 Email Routing OFF", 
                callback_data: `toggle_email_routing:${!isEnabled}`
            }
        ],
        [
            { text: "📨 List Rules", callback_data: "list_email_rules" },
            { text: "➕ Add Rule", callback_data: "add_email_rule" }
        ],
        [
            { text: "🗑 Delete Rule", callback_data: "delete_email_rule" }
        ],
        [
            { text: "📊 Analytics", callback_data: "email_analytics" }
        ],
        [
            { text: "⬅️ Back to Domain", callback_data: "back_to_domain" }
        ]
    ];

    return { inline_keyboard: buttons };
}

function generateRecordTypeMenu() {
    return {
        inline_keyboard: [
            [
                { text: "A", callback_data: "record_type:A" },
                { text: "CNAME", callback_data: "record_type:CNAME" },
                { text: "TXT", callback_data: "record_type:TXT" }
            ],
            [
                { text: "MX", callback_data: "record_type:MX" },
                { text: "AAAA", callback_data: "record_type:AAAA" },
                { text: "NS", callback_data: "record_type:NS" }
            ],
            [
                { text: "⬅️ Cancel", callback_data: "main_menu" }
            ]
        ]
    };
}

function generateProxiedMenu() {
    return {
        inline_keyboard: [
            [
                { text: "✅ Yes (Orange Cloud)", callback_data: "proxied:true" },
                { text: "❌ No (Gray Cloud)", callback_data: "proxied:false" }
            ],
            [
                { text: "⬅️ Cancel", callback_data: "main_menu" }
            ]
        ]
    };
}

function generateDeleteRecordMenu(records) {
    const buttons = [];
    
    records.forEach((record, index) => {
        const displayName = record.name.length > 20 ? record.name.substring(0, 17) + '...' : record.name;
        buttons.push([{
            text: `🗑 ${record.type} ${displayName} → ${record.content}`,
            callback_data: `confirm_delete_record:${record.id}`
        }]);
    });
    
    buttons.push([{ text: "⬅️ Back", callback_data: "back_to_domain" }]);
    
    return { inline_keyboard: buttons };
}

function generateDomainDeleteConfirmMenu() {
    return {
        inline_keyboard: [
            [
                { text: "✅ Yes, Delete Domain", callback_data: "confirm_domain_delete" },
                { text: "❌ Cancel", callback_data: "back_to_domain" }
            ]
        ]
    };
}

function generateEmailRuleTypeMenu() {
    return {
        inline_keyboard: [
            [
                { text: "📧 Forward to Email", callback_data: "rule_type:forward" },
                { text: "🔄 Catch-All", callback_data: "rule_type:catch_all" }
            ],
            [
                { text: "❌ Drop/Block", callback_data: "rule_type:drop" },
                { text: "📝 Custom Action", callback_data: "rule_type:custom" }
            ],
            [
                { text: "⬅️ Cancel", callback_data: "main_menu" }
            ]
        ]
    };
}

function generateLogoutConfirmMenu() {
    return {
        inline_keyboard: [
            [
                { text: "✅ Yes, Logout", callback_data: "confirm_logout" },
                { text: "❌ Cancel", callback_data: "main_menu" }
            ]
        ]
    };
}

// ======================
// CLOUDFLARE API CLIENT
// ======================
class CloudflareAPIClient {
    constructor(email, apiKey) {
        this.email = email;
        this.apiKey = apiKey;
        this.baseUrl = "https://api.cloudflare.com/client/v4";
        this.headers = {
            "X-Auth-Email": email,
            "X-Auth-Key": apiKey,
            "Content-Type": "application/json"
        };
    }

    async listZones() {
        try {
            const response = await fetch(`${this.baseUrl}/zones`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error listing zones:', error);
            return { success: false, error: error.message };
        }
    }

    async addZone(domain) {
        try {
            const payload = { name: domain, jump_start: true };
            const response = await fetch(`${this.baseUrl}/zones`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error adding zone:', error);
            return { success: false, error: error.message };
        }
    }

    async getZoneDetails(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting zone details:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteZone(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}`, {
                method: 'DELETE',
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error deleting zone:', error);
            return { success: false, error: error.message };
        }
    }

    async listDNSRecords(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error listing DNS records:', error);
            return { success: false, error: error.message };
        }
    }

    async addDNSRecord(zoneId, recordType, name, content, proxied = false) {
        try {
            const payload = {
                type: recordType,
                name: name,
                content: content,
                ttl: 120,
                proxied: proxied
            };
            
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error adding DNS record:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteDNSRecord(zoneId, recordId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records/${recordId}`, {
                method: 'DELETE',
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error deleting DNS record:', error);
            return { success: false, error: error.message };
        }
    }

    async updateDNSRecord(zoneId, recordId, recordType, name, content, proxied = false) {
        try {
            const payload = {
                type: recordType,
                name: name,
                content: content,
                ttl: 120,
                proxied: proxied
            };
            
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records/${recordId}`, {
                method: 'PUT',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error updating DNS record:', error);
            return { success: false, error: error.message };
        }
    }

    async getEdgeCertificates(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/ssl/certificate_packs`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting certificates:', error);
            return { success: false, error: error.message };
        }
    }

    async getZoneNameservers(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}`, {
                headers: this.headers
            });
            const data = await response.json();
            
            if (data.success) {
                return {
                    success: true,
                    nameservers: data.result.name_servers || [],
                    original_name_servers: data.result.original_name_servers || [],
                    status: data.result.status,
                    name: data.result.name
                };
            }
            return data;
        } catch (error) {
            console.error('Error getting nameservers:', error);
            return { success: false, error: error.message };
        }
    }

    // Email Routing Methods
    async getEmailRoutingSettings(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting email routing settings:', error);
            return { success: false, error: error.message };
        }
    }

    async enableEmailRouting(zoneId) {
        try {
            const payload = { enabled: true };
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error enabling email routing:', error);
            return { success: false, error: error.message };
        }
    }

    async disableEmailRouting(zoneId) {
        try {
            const payload = { enabled: false };
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error disabling email routing:', error);
            return { success: false, error: error.message };
        }
    }

    async getEmailRoutingRules(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing/rules`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting email routing rules:', error);
            return { success: false, error: error.message };
        }
    }

    async createEmailRoutingRule(zoneId, ruleData) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing/rules`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(ruleData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating email routing rule:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteEmailRoutingRule(zoneId, ruleId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing/rules/${ruleId}`, {
                method: 'DELETE',
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error deleting email routing rule:', error);
            return { success: false, error: error.message };
        }
    }

    async getEmailRoutingAnalytics(zoneId) {
        try {
            const response = await fetch(`${this.baseUrl}/zones/${zoneId}/email/routing/analytics`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting email routing analytics:', error);
            return { success: false, error: error.message };
        }
    }
}

// ======================
// MAIN HANDLER
// ======================
async function handleTelegramWebhook(request, env) {
    try {
        const update = await request.json();

        if (update.callback_query) {
            const { id, message, data } = update.callback_query;
            await handleCallback(env, message.chat.id, message.message_id, data);
            await answerCallbackQuery(id);
            return new Response('OK');
        }

        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || '';
            const fromId = update.message.from.id;

            // Verify admin access
            if (!ADMIN_IDS.includes(fromId)) {
                await sendMessage(chatId, '❌ Anda tidak memiliki akses!');
                return new Response('OK');
            }

            // Handle commands
            if (text.startsWith('/')) {
                if (text === '/start') {
                    await resetUserState(env, chatId);
                    await showMainMenu(chatId, env);
                    return new Response('OK');
                }
                if (text === '/logout') {
                    await handleLogout(env, chatId);
                    return new Response('OK');
                }
            }

            // Handle state-based messages
            const userState = await getUserState(env, chatId);

            switch (userState) {
                case STATE.AWAITING_EMAIL:
                    await handleEmailInput(env, chatId, text);
                    break;
                case STATE.AWAITING_API_KEY:
                    await handleApiKeyInput(env, chatId, text);
                    break;
                case STATE.ADDING_DOMAIN:
                    await handleAddDomain(env, chatId, text);
                    break;
                case STATE.ADDING_DNS_RECORD_TYPE:
                    await handleRecordTypeInput(env, chatId, text);
                    break;
                case STATE.ADDING_DNS_RECORD_NAME:
                    await handleRecordNameInput(env, chatId, text);
                    break;
                case STATE.ADDING_DNS_RECORD_CONTENT:
                    await handleRecordContentInput(env, chatId, text);
                    break;
                case STATE.DELETING_DNS_RECORD:
                    await handleDeleteRecord(env, chatId, text);
                    break;
                case STATE.CONFIGURING_EMAIL_RULE:
                    await handleEmailRuleType(env, chatId, text);
                    break;
                case STATE.ADDING_EMAIL_DESTINATION:
                    await handleEmailDestination(env, chatId, text);
                    break;
                default:
                    await sendMessage(chatId, "Perintah tidak dikenali. Gunakan /start untuk melihat menu.");
            }
        }

        return new Response('OK');
    } catch (error) {
        console.error('Error handling webhook:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

// ======================
// AUTHENTICATION FLOW
// ======================
async function checkAuthStatus(env, chatId) {
    const email = await env.TEST.get(`cf_email_${chatId}`);
    const apiKey = await env.TEST.get(`cf_api_key_${chatId}`);
    
    return {
        isLoggedIn: !!(email && apiKey),
        email: email
    };
}

async function getCredentials(env, chatId) {
    const email = await env.TEST.get(`cf_email_${chatId}`);
    const apiKey = await env.TEST.get(`cf_api_key_${chatId}`);
    return { email, apiKey };
}

async function startAuthFlow(env, chatId) {
    await setUserState(env, chatId, STATE.AWAITING_EMAIL);
    await sendMessage(chatId,
        "🔐 *Setup Cloudflare Credentials*\n\n" +
        "*Step 1/2: Email*\n" +
        "Kirim email akun Cloudflare Anda:",
        { parse_mode: 'Markdown' }
    );
}

async function handleEmailInput(env, chatId, email) {
    if (!email || !email.includes('@')) {
        await sendMessage(chatId, "❌ Format email tidak valid.");
        return;
    }

    await env.TEST.put(`cf_email_${chatId}`, email);
    await setUserState(env, chatId, STATE.AWAITING_API_KEY);

    await sendMessage(chatId,
        "🔑 *Step 2/2: API Key*\n" +
        "Kirim API Key Cloudflare Anda:\n\n" +
        "Dapatkan dari: *Profile → API Tokens → Global API Key*\n\n" +
        "⚠️ API Key akan disimpan secara aman di Cloudflare.",
        { parse_mode: 'Markdown' }
    );
}

async function handleApiKeyInput(env, chatId, apiKey) {
    if (!apiKey || apiKey.length < 10) {
        await sendMessage(chatId, "❌ API Key tidak valid.");
        return;
    }

    const email = await env.TEST.get(`cf_email_${chatId}`);
    
    // Test credentials
    const cf = new CloudflareAPIClient(email, apiKey);
    const zones = await cf.listZones();

    if (zones.success === false) {
        await sendMessage(chatId, 
            "❌ Credentials tidak valid. Silakan coba lagi.\n\n" +
            "Pastikan:\n" +
            "• Email dan API Key benar\n" +
            "• API Key memiliki akses Global\n" +
            "• Akun Cloudflare aktif"
        );
        await startAuthFlow(env, chatId);
        return;
    }

    await env.TEST.put(`cf_api_key_${chatId}`, apiKey);
    await setUserState(env, chatId, STATE.MAIN_MENU);

    await sendMessage(chatId,
        "✅ *Credentials berhasil disimpan!*\n\n" +
        `📧 *Email:* ${email}\n` +
        `🌐 *Domains:* ${zones.result.length} domain ditemukan\n\n` +
        `Gunakan menu di bawah untuk mulai mengelola:`,
        { 
            parse_mode: 'Markdown',
            reply_markup: generateMainMenuWithAuth({ isLoggedIn: true, email: email })
        }
    );
}

// ======================
// DOMAIN MANAGEMENT
// ======================
async function listDomains(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId,
            "🔐 *Login Required*\n\n" +
            "Anda harus login ke Cloudflare terlebih dahulu.",
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔐 Login Now", callback_data: "set_credentials" }]
                    ]
                }
            }
        );
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    const response = await cf.listZones();

    if (!response.success) {
        await sendMessage(chatId, `❌ Error: ${response.errors[0].message}`);
        return;
    }

    const zones = response.result;
    if (zones.length === 0) {
        await sendMessage(chatId, "🌐 Tidak ada domain yang terdaftar.");
        return;
    }

    // Simpan zone data di KV agar callback no human error
    const zonesData = zones.map(zone => ({
        id: zone.id,
        name: zone.name,
        status: zone.status,
        plan: zone.plan?.name || 'Unknown'
    }));
    
    await env.TEST.put(`zones_cache_${chatId}`, JSON.stringify(zonesData));
    await env.TEST.put(`zones_cache_time_${chatId}`, Date.now().toString());

    let message = "🌐 *Daftar Domain Anda:*\n\n";
    const buttons = [];

    zones.forEach((zone, index) => {
        const status = zone.status.toUpperCase();
        const plan = zone.plan?.name || 'Unknown';
        const icon = status === 'ACTIVE' ? '✅' : '⏳';
        
        message += `${index + 1}. *${zone.name}*\n`;
        message += `   ${icon} ${status} • 📦 ${plan}\n\n`;

        // Gunakan index saja untuk callback data
        if (index % 2 === 0) {
            buttons.push([]);
        }
        buttons[buttons.length - 1].push({
            text: `🌐 ${zone.name.substring(0, 15)}${zone.name.length > 15 ? '...' : ''}`,
            callback_data: `select_zone:${index}`
        });
    });

    buttons.push([{ text: "🗑 Delete Domain", callback_data: "start_domain_delete" }]);
    buttons.push([{ text: "⬅️ Main Menu", callback_data: "main_menu" }]);

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function getCachedZones(env, chatId) {
    try {
        const cachedData = await env.TEST.get(`zones_cache_${chatId}`);
        const cacheTime = await env.TEST.get(`zones_cache_time_${chatId}`);
        
        if (!cachedData || !cacheTime) {
            return null;
        }
        
        // Cache valid untuk 5 menit
        const isExpired = (Date.now() - parseInt(cacheTime)) > 5 * 60 * 1000;
        if (isExpired) {
            await env.TEST.delete(`zones_cache_${chatId}`);
            await env.TEST.delete(`zones_cache_time_${chatId}`);
            return null;
        }
        
        return JSON.parse(cachedData);
    } catch (error) {
        console.error('Error getting cached zones:', error);
        return null;
    }
}

async function startAddDomain(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    await setUserState(env, chatId, STATE.ADDING_DOMAIN);
    await sendMessage(chatId,
        "➕ *Tambah Domain Baru*\n\n" +
        "Kirim nama domain yang ingin ditambahkan:\n" +
        "Contoh: `example.com`\n\n" +
        "⚠️ Pastikan domain sudah pointing ke nameserver lama.",
        { parse_mode: 'Markdown' }
    );
}

async function handleAddDomain(env, chatId, domain) {
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    // Validasi domain
    if (!domain || !domain.includes('.') || domain.length < 4) {
        await sendMessage(chatId, "❌ Format domain tidak valid. Contoh: example.com");
        return;
    }

    await sendMessage(chatId, "⏳ Menambahkan domain ke Cloudflare...");
    const response = await cf.addZone(domain);

    await setUserState(env, chatId, STATE.MAIN_MENU);

    if (response.success) {
        const zoneId = response.result.id;
        
        // Tunggu sebentar lalu ambil nameservers
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await sendMessage(chatId, "🔍 Mengambil informasi nameserver...");
        const nsResponse = await cf.getZoneNameservers(zoneId);
        
        if (nsResponse.success) {
            await sendNameserverInfo(chatId, domain, nsResponse);
        } else {
            // Fallback jika gagal ambil nameserver
            await sendMessage(chatId,
                `✅ *Domain berhasil ditambahkan!*\n\n` +
                `*Domain:* ${domain}\n` +
                `*Status:* ${response.result.status}\n\n` +
                `⚠️ *Penting:* Untuk melanjutkan, Anda perlu:\n` +
                `1. Buka Cloudflare Dashboard\n` +
                `2. Pilih domain ${domain}\n` +
                `3. Ikuti instruksi nameserver yang ditampilkan`,
                { parse_mode: 'Markdown' }
            );
        }
        
        // Update cache zone
        await listDomains(env, chatId);
    } else {
        let errorMsg = "❌ Gagal menambahkan domain.";
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        await sendMessage(chatId, errorMsg);
    }
}

async function sendNameserverInfo(chatId, domain, nsResponse) {
    const { nameservers, original_name_servers, status } = nsResponse;
    
    let message = `🎉 *Domain Berhasil Ditambahkan!*\n\n`;
    message += `*Domain:* ${domain}\n`;
    message += `*Status:* ${status}\n\n`;
    
    if (nameservers && nameservers.length > 0) {
        message += `🔧 *NAMESERVER YANG HARUS DISETEL:*\n`;
        
        nameservers.forEach((ns, index) => {
            message += `${index + 1}. \`${ns}\`\n`;
        });
        
        message += `\n📝 *Cara Setup:*\n`;
        message += `1. Buka registrar domain Anda\n`;
        message += `2. Cari pengaturan Nameserver/DNS\n`;
        message += `3. Ganti nameserver dengan yang di atas\n`;
        message += `4. Tunggu propagasi (bisa 24-48 jam)\n\n`;
        
        message += `💡 *Tips:*\n`;
        message += `• Simpan nameserver ini dengan aman\n`;
        message += `• Propagasi bisa dicek di: whatsmydns.net\n`;
        message += `• Domain akan aktif setelah nameserver terpropagasi`;
        
    } else if (original_name_servers && original_name_servers.length > 0) {
        message += `ℹ️ *Domain menggunakan nameserver custom:*\n`;
        original_name_servers.forEach((ns, index) => {
            message += `${index + 1}. \`${ns}\`\n`;
        });
        message += `\nLanjutkan dengan menambahkan DNS records.`;
    } else {
        message += `⚠️ Nameserver tidak tersedia. Cek di Cloudflare Dashboard.`;
    }

    await sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { 
                        text: "🌐 Buka Cloudflare Dashboard", 
                        url: `https://dash.cloudflare.com/` 
                    }
                ],
                [
                    { 
                        text: "🔍 Cek Propagasi DNS", 
                        url: `https://www.whatsmydns.net/#NS/${domain}` 
                    }
                ],
                [
                    { text: "📋 Lihat Domain", callback_data: "list_domains" }
                ]
            ]
        }
    });
}

// ======================
// DNS RECORD MANAGEMENT
// ======================
async function listDNSRecords(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    const response = await cf.listDNSRecords(zoneData.id);

    if (!response.success) {
        await sendMessage(chatId, `❌ Error: ${response.errors[0].message}`);
        return;
    }

    const records = response.result;
    if (records.length === 0) {
        await sendMessage(chatId, `📭 Tidak ada DNS records untuk *${zoneData.name}*`, {
            parse_mode: 'Markdown',
            reply_markup: generateDNSMenu()
        });
        return;
    }

    let message = `📋 *DNS Records untuk ${zoneData.name}:*\n\n`;
    
    records.forEach((record, index) => {
        const cloudIcon = record.proxied ? '🟠' : '⚪';
        message += `${index + 1}. *${record.type}* ${record.name}\n`;
        message += `   ↳ ${record.content} ${cloudIcon}\n`;
        message += `   🆔: \`${record.id}\`\n\n`;
    });

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateDNSMenu()
    });
}

async function startAddDNSRecord(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    await setUserState(env, chatId, STATE.ADDING_DNS_RECORD_TYPE);
    
    await sendMessage(chatId,
        `➕ *Tambah DNS Record untuk ${zoneData.name}*\n\n` +
        "*Step 1/4: Pilih Tipe Record*",
        {
            parse_mode: 'Markdown',
            reply_markup: generateRecordTypeMenu()
        }
    );
}

async function handleRecordTypeInput(env, chatId, recordType) {
    await env.TEST.put(`record_type_${chatId}`, recordType);
    await setUserState(env, chatId, STATE.ADDING_DNS_RECORD_NAME);
    
    await sendMessage(chatId,
        `📝 *Step 2/4: Nama Record*\n\n` +
        "Kirim nama record:\n" +
        "Contoh:\n" +
        "- `@` untuk root domain\n" +
        "- `www` untuk subdomain www\n" +
        "- `api` untuk subdomain api\n\n" +
        "⚠️ Jangan tambahkan domainnya, cukup subdomain saja.",
        { parse_mode: 'Markdown' }
    );
}

async function handleRecordNameInput(env, chatId, recordName) {
    await env.TEST.put(`record_name_${chatId}`, recordName);
    await setUserState(env, chatId, STATE.ADDING_DNS_RECORD_CONTENT);
    
    const recordType = await env.TEST.get(`record_type_${chatId}`);
    
    let examples = "";
    if (recordType === 'A') examples = "Contoh: `192.0.2.1`";
    if (recordType === 'CNAME') examples = "Contoh: `example.com`";
    if (recordType === 'TXT') examples = "Contoh: `v=spf1 include:_spf.google.com ~all`";
    if (recordType === 'MX') examples = "Contoh: `10 mail.example.com`";
    if (recordType === 'AAAA') examples = "Contoh: `2001:db8::1`";
    if (recordType === 'NS') examples = "Contoh: `ns1.example.com`";
    
    await sendMessage(chatId,
        `🔗 *Step 3/4: Konten Record*\n\n` +
        `Tipe: *${recordType}*\n` +
        `Nama: *${recordName}*\n\n` +
        `Kirim konten record:\n${examples}`,
        { parse_mode: 'Markdown' }
    );
}

async function handleRecordContentInput(env, chatId, content) {
    await env.TEST.put(`record_content_${chatId}`, content);
    
    const zoneData = await getZoneData(env, chatId);
    const recordType = await env.TEST.get(`record_type_${chatId}`);
    const recordName = await env.TEST.get(`record_name_${chatId}`);
    
    await sendMessage(chatId,
        `⚙️ *Step 4/4: Proxy Cloudflare*\n\n` +
        `*Summary:*\n` +
        `• Domain: ${zoneData.name}\n` +
        `• Tipe: ${recordType}\n` +
        `• Nama: ${recordName}\n` +
        `• Konten: ${content}\n\n` +
        `Aktifkan proxy Cloudflare (orange cloud)?\n\n` +
        `🟠 Orange Cloud = Traffic melalui Cloudflare CDN\n` +
        `⚪ Gray Cloud = Traffic langsung ke server`,
        {
            parse_mode: 'Markdown',
            reply_markup: generateProxiedMenu()
        }
    );
}

async function completeAddDNSRecord(env, chatId, proxied) {
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    const zoneData = await getZoneData(env, chatId);
    const recordType = await env.TEST.get(`record_type_${chatId}`);
    const recordName = await env.TEST.get(`record_name_${chatId}`);
    const content = await env.TEST.get(`record_content_${chatId}`);
    
    const response = await cf.addDNSRecord(zoneData.id, recordType, recordName, content, proxied === 'true');
    
    // Cleanup
    await env.TEST.delete(`record_type_${chatId}`);
    await env.TEST.delete(`record_name_${chatId}`);
    await env.TEST.delete(`record_content_${chatId}`);
    await setUserState(env, chatId, STATE.MANAGING_ZONE);
    
    if (response.success) {
        await sendMessage(chatId,
            `✅ *DNS Record berhasil ditambahkan!*\n\n` +
            `*Domain:* ${zoneData.name}\n` +
            `*Record:* ${recordType} ${recordName} → ${content}\n` +
            `*Proxy:* ${proxied === 'true' ? '🟠 Enabled' : '⚪ Disabled'}\n\n` +
            `Record ID: \`${response.result.id}\``,
            { 
                parse_mode: 'Markdown',
                reply_markup: generateDNSMenu()
            }
        );
    } else {
        let errorMsg = "❌ Gagal menambahkan DNS record.";
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        await sendMessage(chatId, errorMsg);
    }
}

// ======================
// DELETE RECORD FUNCTION
// ======================
async function startDeleteDNSRecord(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    const response = await cf.listDNSRecords(zoneData.id);

    if (!response.success) {
        await sendMessage(chatId, `❌ Error: ${response.errors[0].message}`);
        return;
    }

    const records = response.result;
    if (records.length === 0) {
        await sendMessage(chatId, `📭 Tidak ada DNS records untuk *${zoneData.name}*`, {
            parse_mode: 'Markdown'
        });
        return;
    }

    await setUserState(env, chatId, STATE.DELETING_DNS_RECORD);

    await sendMessage(chatId,
        `🗑 *Hapus DNS Record dari ${zoneData.name}*\n\n` +
        `Pilih record yang ingin dihapus:`,
        {
            parse_mode: 'Markdown',
            reply_markup: generateDeleteRecordMenu(records)
        }
    );
}

async function handleDeleteRecord(env, chatId, recordId) {
    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        await setUserState(env, chatId, STATE.MAIN_MENU);
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    // Validasi recordId
    if (!recordId || recordId.length < 10) {
        await sendMessage(chatId, "❌ ID record tidak valid.");
        await setUserState(env, chatId, STATE.MANAGING_ZONE);
        return;
    }

    await sendMessage(chatId, "⏳ Menghapus DNS record...");
    const response = await cf.deleteDNSRecord(zoneData.id, recordId);

    await setUserState(env, chatId, STATE.MANAGING_ZONE);

    if (response.success) {
        await sendMessage(chatId,
            `✅ *DNS Record berhasil dihapus!*\n\n` +
            `*Domain:* ${zoneData.name}\n` +
            `*Record ID:* \`${recordId}\``,
            { 
                parse_mode: 'Markdown',
                reply_markup: generateDNSMenu()
            }
        );
    } else {
        let errorMsg = "❌ Gagal menghapus DNS record.";
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        await sendMessage(chatId, errorMsg);
    }
}

async function confirmDeleteRecord(env, chatId, messageId, recordId) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    // Get record details for confirmation
    const recordsResponse = await cf.listDNSRecords(zoneData.id);
    if (recordsResponse.success) {
        const record = recordsResponse.result.find(r => r.id === recordId);
        if (record) {
            await editMessage(chatId, messageId,
                `🗑 *Konfirmasi Hapus Record*\n\n` +
                `Anda akan menghapus record:\n\n` +
                `*Domain:* ${zoneData.name}\n` +
                `*Tipe:* ${record.type}\n` +
                `*Nama:* ${record.name}\n` +
                `*Konten:* ${record.content}\n` +
                `*Proxy:* ${record.proxied ? '🟠' : '⚪'}\n\n` +
                `Tindakan ini tidak dapat dibatalkan!`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Ya, Hapus", callback_data: `execute_delete_record:${recordId}` },
                                { text: "❌ Batal", callback_data: "back_to_domain" }
                            ]
                        ]
                    }
                }
            );
            return;
        }
    }
    
    await sendMessage(chatId, "❌ Record tidak ditemukan.");
}

async function executeDeleteRecord(env, chatId, recordId) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    await sendMessage(chatId, "⏳ Menghapus DNS record...");
    const response = await cf.deleteDNSRecord(zoneData.id, recordId);

    if (response.success) {
        await sendMessage(chatId,
            `✅ *DNS Record berhasil dihapus!*\n\n` +
            `*Domain:* ${zoneData.name}\n` +
            `*Record ID:* \`${recordId}\``,
            { 
                parse_mode: 'Markdown',
                reply_markup: generateDNSMenu()
            }
        );
    } else {
        let errorMsg = "❌ Gagal menghapus DNS record.";
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        await sendMessage(chatId, errorMsg);
    }
}

// ======================
// EMAIL ROUTING MANAGEMENT
// ======================
async function showEmailRoutingMenu(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    // Get current email routing status
    const routingSettings = await cf.getEmailRoutingSettings(zoneData.id);
    
    let statusInfo = {};
    if (routingSettings.success && routingSettings.result) {
        statusInfo = {
            enabled: routingSettings.result.enabled || false,
            status: routingSettings.result.status || 'unknown',
            created: routingSettings.result.created || null,
            name: routingSettings.result.name || zoneData.name
        };
    }

    await setUserState(env, chatId, STATE.MANAGING_EMAIL_ROUTING);

    const statusText = statusInfo.enabled ? '🟢 AKTIF' : '🔴 NONAKTIF';
    const statusDesc = statusInfo.enabled ? 
        'Email routing sedang aktif' : 
        'Email routing belum diaktifkan';

    let message = `📧 *Email Routing - ${zoneData.name}*\n\n`;
    message += `*Status:* ${statusText}\n`;
    message += `${statusDesc}\n\n`;

    if (statusInfo.enabled) {
        message += `✅ Email routing sudah diaktifkan\n`;
        message += `📨 Anda bisa membuat rules untuk meneruskan email\n\n`;
    } else {
        message += `⚠️ Email routing belum diaktifkan\n`;
        message += `Aktifkan terlebih dahulu untuk mulai menggunakan\n\n`;
    }

    message += `Pilih aksi di bawah:`;

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateEmailRoutingMenu(statusInfo)
    });
}

async function toggleEmailRouting(env, chatId, enable) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    await sendMessage(chatId, 
        enable ? 
        "⏳ Mengaktifkan Email Routing..." : 
        "⏳ Menonaktifkan Email Routing..."
    );

    const response = enable ? 
        await cf.enableEmailRouting(zoneData.id) : 
        await cf.disableEmailRouting(zoneData.id);

    if (response.success) {
        await sendMessage(chatId,
            enable ?
            `✅ *Email Routing Diaktifkan!*\n\n` +
            `Domain *${zoneData.name}* sekarang memiliki email routing.\n\n` +
            `Selanjutnya:\n` +
            `1. Tambahkan DNS records MX & TXT secara otomatis\n` +
            `2. Buat rules untuk meneruskan email\n` +
            `3. Verifikasi email destination` :
            `🔴 *Email Routing Dinonaktifkan!*\n\n` +
            `Email routing untuk domain *${zoneData.name}* telah dimatikan.\n` +
            `Semua rules akan berhenti bekerja.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: generateEmailRoutingMenu({ enabled: enable })
            }
        );
    } else {
        let errorMsg = enable ? 
            "❌ Gagal mengaktifkan email routing." : 
            "❌ Gagal menonaktifkan email routing.";
        
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        
        await sendMessage(chatId, errorMsg);
    }
}

async function listEmailRules(env, chatId) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    const rulesResponse = await cf.getEmailRoutingRules(zoneData.id);
    
    if (!rulesResponse.success) {
        await sendMessage(chatId, `❌ Error: ${rulesResponse.errors[0].message}`);
        return;
    }

    const rules = rulesResponse.result || [];
    
    if (rules.length === 0) {
        await sendMessage(chatId,
            `📭 Tidak ada email rules untuk *${zoneData.name}*\n\n` +
            `Gunakan "Add Rule" untuk membuat rule pertama.`,
            {
                parse_mode: 'Markdown',
                reply_markup: generateEmailRoutingMenu({})
            }
        );
        return;
    }

    let message = `📨 *Email Rules - ${zoneData.name}*\n\n`;
    
    rules.forEach((rule, index) => {
        const ruleName = rule.name || `Rule ${index + 1}`;
        const enabled = rule.enabled ? '🟢' : '🔴';
        const actions = rule.actions || [];
        const matchers = rule.matchers || [];
        
        message += `${index + 1}. *${ruleName}* ${enabled}\n`;
        
        // Matchers (conditions)
        if (matchers.length > 0) {
            matchers.forEach(matcher => {
                if (matcher.type === 'literal') {
                    message += `   📥 Jika: *${matcher.field}* = "${matcher.value}"\n`;
                }
            });
        }
        
        // Actions
        if (actions.length > 0) {
            actions.forEach(action => {
                if (action.type === 'forward') {
                    message += `   📤 Teruskan ke: ${action.value}\n`;
                } else if (action.type === 'drop') {
                    message += `   🗑 Drop email\n`;
                }
            });
        }
        
        message += `   🆔: \`${rule.id}\`\n\n`;
    });

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateEmailRoutingMenu({})
    });
}

async function startAddEmailRule(env, chatId) {
    await setUserState(env, chatId, STATE.CONFIGURING_EMAIL_RULE);

    await sendMessage(chatId,
        `➕ *Tambah Email Rule*\n\n` +
        `*Step 1/3: Pilih Tipe Rule*\n\n` +
        `📧 *Forward to Email* - Teruskan email ke alamat tertentu\n` +
        `🔄 *Catch-All* - Tangkap semua email yang tidak ada rulenya\n` +
        `❌ *Drop/Block* - Tolak email tertentu\n` +
        `📝 *Custom Action* - Aksi kustom lainnya`,
        {
            parse_mode: 'Markdown',
            reply_markup: generateEmailRuleTypeMenu()
        }
    );
}

async function handleEmailRuleType(env, chatId, ruleType) {
    await env.TEST.put(`email_rule_type_${chatId}`, ruleType);
    
    const zoneData = await getZoneData(env, chatId);
    
    let message = `📝 *Step 2/3: Konfigurasi Rule*\n\n`;
    message += `Tipe: *${getRuleTypeName(ruleType)}*\n\n`;
    
    switch (ruleType) {
        case 'forward':
            message += `Kirim pattern email yang akan diteruskan:\n\n`;
            message += `Contoh:\n`;
            message += `• \`info\` → untuk info@${zoneData.name}\n`;
            message += `• \`sales\` → untuk sales@${zoneData.name}\n`;
            message += `• \`*\` → untuk semua email (catch-all)\n\n`;
            message += `Kirim pattern email:`;
            break;
            
        case 'catch_all':
            message += `Catch-all akan menangkap SEMUA email yang tidak ada rulenya.\n\n`;
            message += `Kirim email tujuan untuk catch-all:\n`;
            message += `Contoh: \`myemail@gmail.com\``;
            break;
            
        case 'drop':
            message += `Kirim pattern email yang akan di-block/drop:\n\n`;
            message += `Contoh:\n`;
            message += `• \`spam\` → block spam@${zoneData.name}\n`;
            message += `• \`bot\` → block bot@${zoneData.name}\n\n`;
            message += `Kirim pattern email:`;
            break;
    }
    
    await setUserState(env, chatId, STATE.ADDING_EMAIL_DESTINATION);
    await sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

async function handleEmailDestination(env, chatId, destination) {
    const ruleType = await env.TEST.get(`email_rule_type_${chatId}`);
    const zoneData = await getZoneData(env, chatId);
    
    await env.TEST.put(`email_destination_${chatId}`, destination);
    
    let message = `✅ *Step 3/3: Konfirmasi Rule*\n\n`;
    message += `*Domain:* ${zoneData.name}\n`;
    message += `*Tipe Rule:* ${getRuleTypeName(ruleType)}\n`;
    
    switch (ruleType) {
        case 'forward':
            message += `*Pattern:* ${destination}\n`;
            message += `*Email:* ${destination}@${zoneData.name}\n\n`;
            message += `Email akan diteruskan ke tujuan yang akan ditentukan.`;
            break;
            
        case 'catch_all':
            message += `*Tujuan:* ${destination}\n\n`;
            message += `Semua email yang tidak ada rulenya akan diteruskan ke ${destination}`;
            break;
            
        case 'drop':
            message += `*Pattern:* ${destination}\n`;
            message += `*Email:* ${destination}@${zoneData.name}\n\n`;
            message += `Email akan di-block/drop secara permanen.`;
            break;
    }
    
    message += `\n\nKonfirmasi pembuatan rule?`;
    
    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Buat Rule", callback_data: "create_email_rule" },
                    { text: "❌ Batal", callback_data: "email_routing" }
                ]
            ]
        }
    });
}

async function createEmailRule(env, chatId) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    const ruleType = await env.TEST.get(`email_rule_type_${chatId}`);
    const destination = await env.TEST.get(`email_destination_${chatId}`);
    
    let ruleData = {};
    
    switch (ruleType) {
        case 'forward':
            ruleData = {
                name: `Forward ${destination}`,
                enabled: true,
                matchers: [
                    {
                        type: 'literal',
                        field: 'to',
                        value: `${destination}@${zoneData.name}`
                    }
                ],
                actions: [
                    {
                        type: 'forward',
                        value: ['your-email@gmail.com'] // Ini perlu disesuaikan atau terserah anda wkwk
                    }
                ]
            };
            break;
            
        case 'catch_all':
            ruleData = {
                name: 'Catch All',
                enabled: true,
                matchers: [
                    {
                        type: 'all'
                    }
                ],
                actions: [
                    {
                        type: 'forward', 
                        value: [destination]
                    }
                ]
            };
            break;
            
        case 'drop':
            ruleData = {
                name: `Block ${destination}`,
                enabled: true,
                matchers: [
                    {
                        type: 'literal',
                        field: 'to', 
                        value: `${destination}@${zoneData.name}`
                    }
                ],
                actions: [
                    {
                        type: 'drop'
                    }
                ]
            };
            break;
    }
    
    const response = await cf.createEmailRoutingRule(zoneData.id, ruleData);
    
    // Cleanup
    await env.TEST.delete(`email_rule_type_${chatId}`);
    await env.TEST.delete(`email_destination_${chatId}`);
    await setUserState(env, chatId, STATE.MANAGING_EMAIL_ROUTING);
    
    if (response.success) {
        await sendMessage(chatId,
            `✅ *Email Rule Berhasil Dibuat!*\n\n` +
            `*Domain:* ${zoneData.name}\n` +
            `*Tipe:* ${getRuleTypeName(ruleType)}\n` +
            `*Pattern:* ${destination}\n` +
            `*Rule ID:* \`${response.result.id}\``,
            {
                parse_mode: 'Markdown',
                reply_markup: generateEmailRoutingMenu({})
            }
        );
    } else {
        let errorMsg = "❌ Gagal membuat email rule.";
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
        }
        await sendMessage(chatId, errorMsg);
    }
}

function getRuleTypeName(ruleType) {
    const names = {
        'forward': 'Forward to Email',
        'catch_all': 'Catch-All', 
        'drop': 'Drop/Block',
        'custom': 'Custom Action'
    };
    return names[ruleType] || ruleType;
}

async function showEmailAnalytics(env, chatId) {
    const zoneData = await getZoneData(env, chatId);
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    const analytics = await cf.getEmailRoutingAnalytics(zoneData.id);
    
    let message = `📊 *Email Analytics - ${zoneData.name}*\n\n`;
    
    if (analytics.success && analytics.result) {
        const stats = analytics.result;
        
        message += `📨 *Traffic Summary:*\n`;
        message += `• Total Diterima: ${stats.total_received || 0}\n`;
        message += `• Total Diteruskan: ${stats.total_forwarded || 0}\n`;
        message += `• Total Ditolak: ${stats.total_rejected || 0}\n\n`;
        
        message += `🕒 *Period:*\n`;
        message += `• Since: ${stats.since ? new Date(stats.since).toLocaleDateString() : 'N/A'}\n`;
        message += `• Until: ${stats.until ? new Date(stats.until).toLocaleDateString() : 'N/A'}\n\n`;
        
        if (stats.timeseries && stats.timeseries.length > 0) {
            message += `📈 *Recent Activity:*\n`;
            stats.timeseries.slice(-5).forEach(point => {
                const date = new Date(point.timestamp).toLocaleDateString();
                message += `• ${date}: ${point.received} received, ${point.forwarded} forwarded\n`;
            });
        }
    } else {
        message += `📊 Data analytics tidak tersedia.\n`;
        message += `Pastikan email routing sudah aktif dan ada traffic.`;
    }

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateEmailRoutingMenu({})
    });
}

// ======================
// DOMAIN DELETE
// ======================
async function startDomainDelete(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    const response = await cf.listZones();

    if (!response.success) {
        await sendMessage(chatId, `❌ Error: ${response.errors[0].message}`);
        return;
    }

    const zones = response.result;
    if (zones.length === 0) {
        await sendMessage(chatId, "🌐 Tidak ada domain yang bisa dihapus.");
        return;
    }

    await setUserState(env, chatId, STATE.DELETING_DOMAIN);
    
    let message = "🗑 *Pilih Domain untuk Dihapus:*\n\n";
    const buttons = [];

    zones.forEach((zone, index) => {
        const status = zone.status.toUpperCase();
        const plan = zone.plan?.name || 'Unknown';
        const icon = status === 'ACTIVE' ? '🔴' : '🟡';
        
        message += `${index + 1}. *${zone.name}*\n`;
        message += `   ${icon} ${status} • 📦 ${plan}\n\n`;

        buttons.push([{
            text: `🗑 ${zone.name}`,
            callback_data: `confirm_domain_delete:${zone.id}`
        }]);
    });

    buttons.push([{ text: "⬅️ Cancel", callback_data: "list_domains" }]);

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function confirmDomainDelete(env, chatId, messageId, zoneId) {
    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    // Get zone details untuk konfirmasi
    const zoneInfo = await cf.getZoneDetails(zoneId);
    const dnsRecords = await cf.listDNSRecords(zoneId);
    
    let message = `⚠️ *KONFIRMASI PENGHAPUSAN DOMAIN*\n\n`;
    message += `Anda akan menghapus domain berikut:\n\n`;
    
    if (zoneInfo.success) {
        message += `*Domain:* ${zoneInfo.result.name}\n`;
        message += `*Status:* ${zoneInfo.result.status}\n`;
        message += `*Plan:* ${zoneInfo.result.plan?.name || 'Unknown'}\n`;
        message += `*Dibuat:* ${new Date(zoneInfo.result.created_on).toLocaleDateString('id-ID')}\n`;
    }
    
    message += `*DNS Records:* ${dnsRecords.success ? dnsRecords.result.length : 0} records\n\n`;
    
    message += `🚨 *PERINGATAN:*\n`;
    message += `• Domain akan dihapus PERMANEN dari Cloudflare\n`;
    message += `• Semua DNS records akan ikut terhapus\n`;
    message += `• Sertifikat SSL akan dihapus\n`;
    message += `• Tidak dapat dikembalikan!\n\n`;
    
    message += `Tindakan ini TIDAK DAPAT DIBATALKAN!`;

    // Store zone data untuk digunakan nanti
    if (zoneInfo.success) {
        await storeZoneData(env, chatId, zoneId, zoneInfo.result.name);
    }

    await editMessage(chatId, messageId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateDomainDeleteConfirmMenu()
    });
}

async function executeDomainDelete(env, chatId) {
    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);

    await sendMessage(chatId, 
        `⏳ Menghapus domain *${zoneData.name}*...\n` +
        `Ini mungkin membutuhkan beberapa saat.`,
        { parse_mode: 'Markdown' }
    );

    const response = await cf.deleteZone(zoneData.id);

    if (response.success) {
        // Hapus dari cache jika ada
        await env.TEST.delete(`zones_cache_${chatId}`);
        await env.TEST.delete(`zones_cache_time_${chatId}`);
        await clearZoneData(env, chatId);
        
        await sendMessage(chatId,
            `✅ *Domain Berhasil Dihapus!*\n\n` +
            `*Domain:* ${zoneData.name}\n` +
            `*Zone ID:* \`${zoneData.id}\`\n\n` +
            `Domain telah dihapus permanen dari Cloudflare.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📋 Lihat Domain Lain", callback_data: "list_domains" }]
                    ]
                }
            }
        );
    } else {
        let errorMsg = `❌ Gagal menghapus domain ${zoneData.name}.`;
        if (response.errors && response.errors.length > 0) {
            errorMsg += `\nError: ${response.errors[0].message}`;
            
            // Handle specific errors
            if (response.errors[0].message.includes('already queued for deletion')) {
                errorMsg += `\n\nDomain sedang dalam proses penghapusan.`;
            }
        }
        await sendMessage(chatId, errorMsg);
    }
}

// ======================
// LOGOUT FUNCTION
// ======================
async function logoutUser(env, chatId) {
    try {
        // Hapus semua data credentials, state, dan cache
        await env.TEST.delete(`cf_email_${chatId}`);
        await env.TEST.delete(`cf_api_key_${chatId}`);
        await env.TEST.delete(`state_${chatId}`);
        await clearZoneData(env, chatId);
        await env.TEST.delete(`record_type_${chatId}`);
        await env.TEST.delete(`record_name_${chatId}`);
        await env.TEST.delete(`record_content_${chatId}`);
        await env.TEST.delete(`email_rule_type_${chatId}`);
        await env.TEST.delete(`email_destination_${chatId}`);
        
        // Hapus cache zone
        await env.TEST.delete(`zones_cache_${chatId}`);
        await env.TEST.delete(`zones_cache_time_${chatId}`);
        
        // Reset state ke main menu
        await setUserState(env, chatId, STATE.MAIN_MENU);
        
        return true;
    } catch (error) {
        console.error('Error during logout:', error);
        return false;
    }
}

async function handleLogout(env, chatId, messageId = null) {
    const authStatus = await checkAuthStatus(env, chatId);
    
    if (!authStatus.isLoggedIn) {
        const message = "ℹ️ Anda belum login ke Cloudflare.";
        if (messageId) {
            await editMessage(chatId, messageId, message, { parse_mode: 'Markdown' });
        } else {
            await sendMessage(chatId, message);
        }
        return;
    }
    
    const message = `🚪 *Konfirmasi Logout*\n\n` +
        `Anda akan logout dari akun:\n` +
        `📧 *${authStatus.email}*\n\n` +
        `Semua credentials akan dihapus.`;
    
    if (messageId) {
        await editMessage(chatId, messageId, message, {
            parse_mode: 'Markdown',
            reply_markup: generateLogoutConfirmMenu()
        });
    } else {
        await sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: generateLogoutConfirmMenu()
        });
    }
}

async function confirmLogout(env, chatId, messageId) {
    const authStatus = await checkAuthStatus(env, chatId);
    const success = await logoutUser(env, chatId);
    
    if (success) {
        await editMessage(chatId, messageId,
            `✅ *Logout Berhasil!*\n\n` +
            `Akun *${authStatus.email}* telah logout.\n` +
            `Semua credentials telah dihapus.`,
            {
                parse_mode: 'Markdown',
                reply_markup: generateMainMenuWithAuth({ isLoggedIn: false })
            }
        );
    } else {
        await editMessage(chatId, messageId,
            "❌ Gagal logout. Silakan coba lagi.",
            { parse_mode: 'Markdown' }
        );
    }
}

// ======================
// CALLBACK HANDLER
// ======================
async function handleCallback(env, chatId, messageId, callbackData) {
    console.log('Handling callback:', callbackData);
    
    try {
        // Navigation
        if (callbackData === 'main_menu') {
            await resetUserState(env, chatId);
            await editMessage(chatId, messageId, `*🤖 ${BOT_NAME}*`, {
                parse_mode: 'Markdown',
                reply_markup: generateMainMenuWithAuth(await checkAuthStatus(env, chatId))
            });
            return;
        }

        if (callbackData === 'list_domains') {
            await listDomains(env, chatId);
            return;
        }

        if (callbackData === 'add_domain') {
            await startAddDomain(env, chatId);
            return;
        }

        if (callbackData === 'set_credentials') {
            await startAuthFlow(env, chatId);
            return;
        }

        if (callbackData === 'refresh') {
            await listDomains(env, chatId);
            return;
        }

        if (callbackData === 'logout') {
            await handleLogout(env, chatId, messageId);
            return;
        }

        if (callbackData === 'confirm_logout') {
            await confirmLogout(env, chatId, messageId);
            return;
        }

        // Zone selection dengan index
        if (callbackData.startsWith('select_zone:')) {
            const zoneIndex = parseInt(callbackData.split(':')[1]);
            await handleZoneSelection(env, chatId, messageId, zoneIndex);
            return;
        }

        // Zone management
        if (callbackData === 'back_to_domain') {
            const zoneData = await getZoneData(env, chatId);
            if (zoneData) {
                await editMessage(chatId, messageId, 
                    `🌐 *Managing: ${zoneData.name}*\n\nPilih aksi:`, {
                    parse_mode: 'Markdown',
                    reply_markup: generateDNSMenu()
                });
            } else {
                await listDomains(env, chatId);
            }
            return;
        }

        // DNS Records management
        if (callbackData === 'list_records') {
            await listDNSRecords(env, chatId);
            return;
        }

        if (callbackData === 'add_record') {
            await startAddDNSRecord(env, chatId);
            return;
        }

        if (callbackData === 'delete_record') {
            await startDeleteDNSRecord(env, chatId);
            return;
        }

        // Record type selection
        if (callbackData.startsWith('record_type:')) {
            const recordType = callbackData.split(':')[1];
            await handleRecordTypeInput(env, chatId, recordType);
            return;
        }

        // Proxied selection
        if (callbackData.startsWith('proxied:')) {
            const proxied = callbackData.split(':')[1];
            await completeAddDNSRecord(env, chatId, proxied);
            return;
        }

        // Delete record confirmation
        if (callbackData.startsWith('confirm_delete_record:')) {
            const recordId = callbackData.split(':')[1];
            await confirmDeleteRecord(env, chatId, messageId, recordId);
            return;
        }

        if (callbackData.startsWith('execute_delete_record:')) {
            const recordId = callbackData.split(':')[1];
            await executeDeleteRecord(env, chatId, recordId);
            return;
        }

        // SSL Certificates
        if (callbackData === 'view_ssl') {
            await viewSSLCertificates(env, chatId);
            return;
        }

        // Nameservers
        if (callbackData === 'view_nameservers') {
            await viewNameservers(env, chatId);
            return;
        }

        // Email Routing
        if (callbackData === 'email_routing') {
            await showEmailRoutingMenu(env, chatId);
            return;
        }

        if (callbackData.startsWith('toggle_email_routing:')) {
            const enable = callbackData.split(':')[1] === 'true';
            await toggleEmailRouting(env, chatId, enable);
            return;
        }

        if (callbackData === 'list_email_rules') {
            await listEmailRules(env, chatId);
            return;
        }

        if (callbackData === 'add_email_rule') {
            await startAddEmailRule(env, chatId);
            return;
        }

        if (callbackData.startsWith('rule_type:')) {
            const ruleType = callbackData.split(':')[1];
            await handleEmailRuleType(env, chatId, ruleType);
            return;
        }

        if (callbackData === 'create_email_rule') {
            await createEmailRule(env, chatId);
            return;
        }

        if (callbackData === 'email_analytics') {
            await showEmailAnalytics(env, chatId);
            return;
        }

        // Domain Delete
        if (callbackData === 'start_domain_delete') {
            await startDomainDelete(env, chatId);
            return;
        }

        if (callbackData === 'delete_domain') {
            await confirmDomainDelete(env, chatId, messageId);
            return;
        }

        if (callbackData.startsWith('confirm_domain_delete:')) {
            const zoneId = callbackData.split(':')[1];
            await confirmDomainDelete(env, chatId, messageId, zoneId);
            return;
        }

        if (callbackData === 'execute_domain_delete') {
            await executeDomainDelete(env, chatId);
            return;
        }

        // Fallback untuk unknown callback
        await answerCallbackQuery(callbackData, "⚠️ Perintah tidak dikenali");
        
    } catch (error) {
        console.error('Error in handleCallback:', error);
        await sendMessage(chatId, "❌ Terjadi error. Silakan coba lagi.");
    }
}

// ======================
// HELPER FUNCTIONS
// ======================
async function handleZoneSelection(env, chatId, messageId, zoneIndex) {
    const cachedZones = await getCachedZones(env, chatId);
    
    if (!cachedZones || !cachedZones[zoneIndex]) {
        // Fallback: refresh list
        await editMessage(chatId, messageId, "🔄 Memuat ulang daftar domain...");
        await listDomains(env, chatId);
        return;
    }
    
    const zone = cachedZones[zoneIndex];
    
    // Simpan zone yang dipilih di state
    await setUserState(env, chatId, STATE.MANAGING_ZONE);
    await storeZoneData(env, chatId, zone.id, zone.name);
    
    await editMessage(chatId, messageId, 
        `🌐 *Managing: ${zone.name}*\n\n` +
        `Status: ${zone.status}\n` +
        `Plan: ${zone.plan}\n\n` +
        `Pilih aksi:`, {
        parse_mode: 'Markdown',
        reply_markup: generateDNSMenu()
    });
}

async function viewSSLCertificates(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    const response = await cf.getEdgeCertificates(zoneData.id);

    if (!response.success) {
        await sendMessage(chatId, `❌ Error: ${response.errors[0].message}`);
        return;
    }

    const certs = response.result;
    if (!certs || certs.length === 0) {
        await sendMessage(chatId, `🔐 Tidak ada sertifikat SSL untuk *${zoneData.name}*`, {
            parse_mode: 'Markdown',
            reply_markup: generateDNSMenu()
        });
        return;
    }

    let message = `🔐 *SSL Certificates untuk ${zoneData.name}:*\n\n`;
    
    certs.forEach((cert, index) => {
        const status = cert.status || 'unknown';
        const certType = cert.type || 'unknown';
        const hosts = cert.hosts ? cert.hosts.join(', ') : 'none';
        const issued = cert.issued_on ? new Date(cert.issued_on).toLocaleDateString() : 'N/A';
        const expires = cert.expires_on ? new Date(cert.expires_on).toLocaleDateString() : 'N/A';

        message += `${index + 1}. *${status.toUpperCase()}* (${certType})\n`;
        message += `   🏷️: ${hosts}\n`;
        message += `   📅 Issued: ${issued}\n`;
        message += `   ⏰ Expires: ${expires}\n\n`;
    });

    await sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: generateDNSMenu()
    });
}

async function viewNameservers(env, chatId) {
    const authStatus = await checkAuthStatus(env, chatId);
    if (!authStatus.isLoggedIn) {
        await sendMessage(chatId, "🔐 Silakan login terlebih dahulu.");
        return;
    }

    const zoneData = await getZoneData(env, chatId);
    if (!zoneData) {
        await sendMessage(chatId, "❌ Tidak ada domain yang dipilih.");
        return;
    }

    const { email, apiKey } = await getCredentials(env, chatId);
    const cf = new CloudflareAPIClient(email, apiKey);
    
    await sendMessage(chatId, "🔍 Mengambil informasi nameserver...");
    const nsResponse = await cf.getZoneNameservers(zoneData.id);
    
    if (nsResponse.success) {
        await sendNameserverInfo(chatId, zoneData.name, nsResponse);
    } else {
        await sendMessage(chatId, 
            `❌ Gagal mengambil nameserver untuk ${zoneData.name}\n\n` +
            `Silakan cek langsung di Cloudflare Dashboard.`,
            { parse_mode: 'Markdown' }
        );
    }
}

async function showMainMenu(chatId, env = null) {
    let message = `*🤖 ${BOT_NAME}*`;
    
    if (env) {
        const authStatus = await checkAuthStatus(env, chatId);
        const keyboard = generateMainMenuWithAuth(authStatus);
        
        if (authStatus.isLoggedIn) {
            message += `\n\n✅ *SUDAH LOGIN DI:* ${authStatus.email}`;
        } else {
            message += `\n\n⚠️ *SILAHKAN LOGIN DULU YA ONII CHAN*`;
        }
        
        await sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        await sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: generateMainMenuWithAuth({ isLoggedIn: false })
        });
    }
}

async function setUserState(env, userId, state) {
    await env.TEST.put(`state_${userId}`, state);
}

async function getUserState(env, userId) {
    return await env.TEST.get(`state_${userId}`);
}

async function resetUserState(env, userId) {
    const keys = [
        `state_${userId}`,
        `record_type_${userId}`,
        `record_name_${userId}`,
        `record_content_${userId}`,
        `email_rule_type_${userId}`,
        `email_destination_${userId}`
    ];
    
    for (const key of keys) {
        await env.TEST.delete(key);
    }
}

// ======================
// TELEGRAM API 
// ======================
async function sendMessage(chatId, text, options = {}) {
    const payload = {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
    };

    try {
        const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            console.error('Telegram API error:', await response.text());
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function editMessage(chatId, messageId, text, options = {}) {
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        ...options
    };

    try {
        const response = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            console.error('Telegram API error:', await response.text());
        }
    } catch (error) {
        console.error('Error editing message:', error);
    }
}

async function answerCallbackQuery(callbackId, text = null) {
    const payload = {
        callback_query_id: callbackId
    };
    
    if (text) {
        payload.text = text;
    }

    try {
        await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error('Error answering callback:', error);
    }
}
