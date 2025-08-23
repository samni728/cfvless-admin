// =================================================================================
// _worker.js V2.0 FINAL - Correct Structure
// 备注：增加了节点管理和导入功能
// =================================================================================

// =================================================================================
// 辅助函数和常量 - 必须在 export default 之前定义
// =================================================================================

// Clash 配置模板
const clashConfigTemplate = `
mixed-port: 7890
allow-lan: true
mode: rule
log-level: info
external-controller: :9090
proxies:
##PROXIES##
proxy-groups:
  - name: "🚀 节点选择"
    type: select
    proxies:
##PROXY_NAMES##
  - name: "♻️ 自动选择"
    type: url-test
    proxies:
##PROXY_NAMES##
    url: 'http://www.gstatic.com/generate_204'
    interval: 300
rules:
  - MATCH,🚀 节点选择
`;

// UTF-8 安全的 Base64 编码/解码函数
function safeBase64Encode(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) { return null; }
}

function safeBase64Decode(str) {
    try {
        return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) { return null; }
}

// 密码哈希函数
async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 用户会话验证函数
async function getUserBySession(request, env) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader || !cookieHeader.includes('session_id=')) {
        return null;
    }
    
    try {
        const sessionId = cookieHeader.match(/session_id=([^;]+)/)[1];
        const userId = await env.subscription.get(`session:${sessionId}`);
        if (!userId) return null;
        
        const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(parseInt(userId)).first();
        return user || null;
    } catch (e) {
        console.error('Session validation error:', e);
        return null;
    }
}

// 修复后的哈希函数 - 解决hash冲突问题
function generateSimpleHash(str) {
    if (!str || typeof str !== 'string') return null;
    
    // 使用URL本身的特征生成更稳定的hash
    let hash = 0;
    
    // 第一层hash：基于字符串内容
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
        
        // 添加位置权重，减少冲突
        hash = hash ^ (char << (i % 16));
        hash = hash & hash;
    }
    
    // 第二层hash：基于内容特征
    const contentHash = str.split('').reduce((acc, char, index) => {
        return acc + char.charCodeAt(0) * (index + 1);
    }, 0);
    
    // 提取URL的关键部分作为唯一标识
    const urlParts = str.match(/@([^:]+):(\d+)/);
    const serverInfo = urlParts ? `${urlParts[1]}_${urlParts[2]}` : 'manual';
    
    // 组合多个hash值和URL特征
    const finalHash = Math.abs(hash ^ contentHash);
    
    // 使用更强的唯一性标识
    return `node_${finalHash.toString(36)}_${str.length}_${serverInfo}_${Date.now() % 1000000}`;
}

// 刷新所有订阅源
async function fetchAllSourcesAndRefresh(userId, env) {
    const { results } = await env.DB.prepare(
        "SELECT * FROM subscription_sources WHERE user_id = ?"
    ).bind(userId).all();
    
    if (results && results.length > 0) {
        const refreshPromises = results.map(source => refreshSubscriptionSource(source, env));
        await Promise.all(refreshPromises);
    }
}

// 刷新单个订阅源
async function refreshSubscriptionSource(source, env) {
    const now = new Date().toISOString();
    try {
        await env.DB.prepare("UPDATE subscription_sources SET fetch_status = 'fetching', last_fetch_at = ? WHERE id = ?")
            .bind(now, source.id).run();

        const response = await fetch(source.source_url, { headers: { 'User-Agent': 'Clash/2023.08.17' } });
        if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);
        
        const content = await response.text();
        const decodedContent = safeBase64Decode(content) || content;
        const nodeLinks = decodedContent.split(/[\n\r]+/).filter(link => link.trim() !== '');

        if (nodeLinks.length === 0) {
            await env.DB.prepare("UPDATE subscription_sources SET fetch_status = 'success', node_count = 0, updated_at = ? WHERE id = ?")
                .bind(now, source.id).run();
            return;
        }

        await env.DB.prepare("DELETE FROM node_pool WHERE user_id = ? AND source_id = ?").bind(source.user_id, source.id).run();

        const statements = [];
        for (const link of nodeLinks) {
            const hash = generateSimpleHash(link);
            if(hash) {
                statements.push(
                    env.DB.prepare("INSERT OR IGNORE INTO node_pool (user_id, source_id, node_url, node_hash) VALUES (?, ?, ?, ?)")
                       .bind(source.user_id, source.id, link, hash)
                );
            }
        }
        
        if (statements.length > 0) {
            await env.DB.batch(statements);
        }

        await env.DB.prepare("UPDATE subscription_sources SET fetch_status = 'success', node_count = ?, updated_at = ? WHERE id = ?")
            .bind(statements.length, now, source.id).run();

    } catch (e) {
        console.error(`Failed to refresh source ${source.id}:`, e.message);
        await env.DB.prepare("UPDATE subscription_sources SET fetch_status = 'failed', updated_at = ? WHERE id = ?")
            .bind(now, source.id).run();
    }
}

// 节点链接解析函数
function parseNodeLinkForConfig(url) {
    try {
        const urlObject = new URL(url);
        if (url.startsWith('vless://')) {
            let uuid = urlObject.username; if (uuid.includes(':')) uuid = uuid.split(':')[1];
            const config = {
                name: urlObject.hash ? decodeURIComponent(urlObject.hash.substring(1)) : `vless-${urlObject.hostname}`,
                type: 'vless', server: urlObject.hostname, port: parseInt(urlObject.port, 10),
                uuid: uuid, tls: urlObject.searchParams.get('security') === 'tls' || urlObject.port === '443',
                'client-fingerprint': 'chrome', servername: urlObject.searchParams.get('sni') || urlObject.hostname,
                network: urlObject.searchParams.get('type') || 'tcp',
            };
            if (config.network === 'ws') config['ws-opts'] = { path: urlObject.searchParams.get('path') || '/', headers: { Host: urlObject.searchParams.get('host') || urlObject.hostname } };
            return config;
        } else if (url.startsWith('vmess://')) {
            const data = url.substring('vmess://'.length);
            const decodedStr = safeBase64Decode(data); const config = JSON.parse(decodedStr);
            return {
                name: config.ps || `vmess-${config.add}`, type: 'vmess', server: config.add,
                port: parseInt(config.port, 10), uuid: config.id, alterId: parseInt(config.aid || '0', 10),
                cipher: config.scy || 'auto', tls: config.tls === 'tls', 'client-fingerprint': 'chrome',
                servername: config.sni || config.add, network: config.net || 'tcp',
                'ws-opts': config.net === 'ws' ? { path: config.path || '/', headers: { Host: config.host || config.add } } : undefined
            };
        }
    } catch(e) { return null; }
    return null;
}

// =================================================================================
// 主要的 Worker 导出
// =================================================================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 调试路由 - 检查数据库连接和表结构
        if (url.pathname === '/api/debug' && request.method === 'GET') {
            try {
                const dbCheck = env.DB ? 'DB绑定正常' : 'DB未绑定';
                const kvCheck = env.subscription ? 'KV绑定正常' : 'KV未绑定';
                
                let tableCheck = '未知';
                let usersTableStructure = '未知';
                
                if (env.DB) {
                    try {
                        // 检查users表是否存在
                        const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
                        tableCheck = result ? 'users表存在' : 'users表不存在';
                        
                        if (result) {
                            // 检查users表结构
                            const structure = await env.DB.prepare("PRAGMA table_info(users)").all();
                            usersTableStructure = structure.results.map(col => `${col.name}(${col.type})`).join(', ');
                        }
                    } catch (e) {
                        tableCheck = `表检查失败: ${e.message}`;
                    }
                }
                
                return new Response(JSON.stringify({ 
                    database: dbCheck,
                    kv: kvCheck,
                    table: tableCheck,
                    users_table_structure: usersTableStructure,
                    timestamp: new Date().toISOString()
                }), { 
                    headers: { 'Content-Type': 'application/json' } 
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: `调试失败: ${e.message}` }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 用户认证路由 =========================================================

        // 路由: 用户注册 (POST /api/register)
        if (url.pathname === '/api/register' && request.method === 'POST') {
            try {
                const { username, password } = await request.json();
                console.log('注册请求:', { username, passwordLength: password?.length });
                
                if (!username || !password) {
                    return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }
                
                console.log('检查用户是否存在...');
                const existingUser = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                console.log('现有用户查询结果:', existingUser);
                
                if (existingUser) {
                    return new Response(JSON.stringify({ error: '用户名已存在' }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }
                
                console.log('开始创建用户...');
                const hashedPassword = await hashPassword(password);
                console.log('密码哈希完成');
                
                await env.DB.prepare("INSERT INTO users (username, hashed_password) VALUES (?, ?)").bind(username, hashedPassword).run();
                console.log('用户创建成功');
                
                return new Response(JSON.stringify({ message: '注册成功' }), { 
                    status: 201, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            } catch (e) {
                console.error('注册失败详细错误:', e);
                return new Response(JSON.stringify({ 
                    error: '注册失败', 
                    details: e.message,
                    stack: e.stack 
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 用户登录 (POST /api/login)
        if (url.pathname === '/api/login' && request.method === 'POST') {
            try {
                const { username, password } = await request.json();
                console.log('登录请求:', { username, passwordLength: password?.length });
                
                const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
                console.log('用户查询结果:', user ? '找到用户' : '用户不存在');
                
                if (!user || await hashPassword(password) !== user.hashed_password) {
                    return new Response(JSON.stringify({ error: '用户名或密码错误' }), { 
                        status: 401, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }
                
                const sessionId = crypto.randomUUID();
                console.log('创建会话:', sessionId);
                
                await env.subscription.put(`session:${sessionId}`, user.id.toString(), { expirationTtl: 86400 * 7 });
                
                const response = new Response(JSON.stringify({ message: '登录成功', username: user.username }), {
                    headers: { 'Content-Type': 'application/json' }
                });
                response.headers.set('Set-Cookie', `session_id=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${86400 * 7}; Path=/`);
                return response;
            } catch (e) {
                console.error('登录失败详细错误:', e);
                return new Response(JSON.stringify({ 
                    error: '登录失败', 
                    details: e.message 
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 用户登出 (POST /api/logout)
        if (url.pathname === '/api/logout' && request.method === 'POST') {
            const cookieHeader = request.headers.get('Cookie');
            if (cookieHeader && cookieHeader.includes('session_id=')) {
                const sessionId = cookieHeader.match(/session_id=([^;]+)/)[1];
                await env.subscription.delete(`session:${sessionId}`);
            }
            const response = new Response(JSON.stringify({ message: '登出成功' }));
            response.headers.set('Set-Cookie', 'session_id=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
            return response;
        }

        // 路由: 检查登录状态 (GET /api/status)
        if (url.pathname === '/api/status' && request.method === 'GET') {
            const user = await getUserBySession(request, env);
            if (!user) {
                return new Response(JSON.stringify({ authenticated: false }), { headers: { 'Content-Type': 'application/json' } });
            }
            const sub = await env.DB.prepare("SELECT uuid FROM subscriptions WHERE user_id = ?").bind(user.id).first();
            return new Response(JSON.stringify({
                authenticated: true,
                username: user.username,
                subscriptionUuid: sub ? sub.uuid : null
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        // --- NEW V2.0: Tag-Centric Management APIs ---

        // =================================================================
        // START: DEFINITIVE FIX for GET /api/tags
        // =================================================================
        if (url.pathname === '/api/tags' && request.method === 'GET') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                // A much simpler, more robust query. We get the main tag info first.
                const { results: tags } = await env.DB.prepare(
                    `SELECT id, tag_name, description, tag_uuid, created_at FROM tags WHERE user_id = ? ORDER BY created_at DESC`
                ).bind(user.id).all();

                if (!tags || tags.length === 0) {
                    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
                }

                // Now, get node counts for all tags in a separate, efficient query.
                const tagIds = tags.map(t => t.id);
                const placeholders = tagIds.map(() => '?').join(',');
                
                const { results: counts } = await env.DB.prepare(
                    `SELECT tag_id, 
                            COUNT(node_id) as node_count, 
                            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count 
                     FROM node_tag_map 
                     LEFT JOIN node_pool ON node_pool.id = node_tag_map.node_id
                     WHERE tag_id IN (${placeholders})
                     GROUP BY tag_id`
                ).bind(...tagIds).all();

                // Create a map for easy lookup
                const countMap = new Map(counts.map(c => [c.tag_id, { node_count: c.node_count, active_count: c.active_count || 0 }]));

                // Combine the data
                const resultsWithCounts = tags.map(tag => ({
                    ...tag,
                    node_count: countMap.get(tag.id)?.node_count || 0,
                    active_count: countMap.get(tag.id)?.active_count || 0
                }));

                return new Response(JSON.stringify(resultsWithCounts), { headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                console.error('获取Tag列表失败:', e);
                return new Response(JSON.stringify({ 
                    error: '获取Tag列表时发生数据库错误',
                    details: e.message
                }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }
        // =================================================================
        // END: DEFINITIVE FIX
        // =================================================================

        // 路由: 批量删除Tag (POST /api/tags/batch-delete) - 受保护
        if (url.pathname === '/api/tags/batch-delete' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { tag_ids } = await request.json();
                
                if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
                    return new Response(JSON.stringify({ error: 'Tag ID列表不能为空' }), { status: 400 });
                }

                // 验证Tag所有权
                const { results: userTags } = await env.DB.prepare(
                    `SELECT id, tag_name FROM tags WHERE user_id = ? AND id IN (${tag_ids.map(() => '?').join(',')})`
                ).bind(user.id, ...tag_ids).all();
                
                if (userTags.length !== tag_ids.length) {
                    return new Response(JSON.stringify({ error: '部分Tag不存在或无权限' }), { status: 403 });
                }

                // 批量删除Tag和相关映射关系
                const statements = [];
                
                // 1. 删除node_tag_map中的映射关系
                for (const tagId of tag_ids) {
                    statements.push(
                        env.DB.prepare("DELETE FROM node_tag_map WHERE tag_id = ?").bind(tagId)
                    );
                }
                
                // 2. 删除tags表中的记录
                for (const tagId of tag_ids) {
                    statements.push(
                        env.DB.prepare("DELETE FROM tags WHERE user_id = ? AND id = ?").bind(user.id, tagId)
                    );
                }

                await env.DB.batch(statements);

                const tagNames = userTags.map(tag => tag.tag_name).join('、');
                return new Response(JSON.stringify({
                    message: `成功删除 ${tag_ids.length} 个Tag: ${tagNames}`
                }), { 
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (e) {
                console.error('批量删除Tag失败:', e);
                return new Response(JSON.stringify({ 
                    error: `删除失败: ${e.message}` 
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 创建新Tag (POST /api/tags) - 受保护
        if (url.pathname === '/api/tags' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { tag_name, description } = await request.json();
                if (!tag_name || tag_name.trim().length === 0) {
                    return new Response(JSON.stringify({ error: 'Tag名称不能为空' }), { status: 400 });
                }

                const existing = await env.DB.prepare(
                    "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
                ).bind(user.id, tag_name.trim()).first();

                if (existing) {
                    return new Response(JSON.stringify({ error: 'Tag名称已存在' }), { status: 400 });
                }

                const tagUuid = crypto.randomUUID();
                await env.DB.prepare(
                    "INSERT INTO tags (user_id, tag_name, description, tag_uuid) VALUES (?, ?, ?, ?)"
                ).bind(user.id, tag_name.trim(), description || '', tagUuid).run();

                return new Response(JSON.stringify({ 
                    message: 'Tag创建成功', 
                    tag_name: tag_name.trim(),
                    uuid: tagUuid 
                }), { status: 201 });
            } catch (e) {
                console.error('创建Tag失败:', e);
                return new Response(JSON.stringify({ error: `创建失败: ${e.message}` }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 将节点添加到Tag (POST /api/tags/add-nodes) - 受保护
        if (url.pathname === '/api/tags/add-nodes' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { tag_name, nodes } = await request.json();
                if (!tag_name || !nodes || !Array.isArray(nodes)) {
                    return new Response(JSON.stringify({ error: '参数错误' }), { status: 400 });
                }

                console.log(`开始处理Tag: ${tag_name}, 节点数量: ${nodes.length}`);

                let tag = await env.DB.prepare(
                    "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
                ).bind(user.id, tag_name).first();

                if (!tag) {
                    const tagUuid = crypto.randomUUID();
                    await env.DB.prepare(
                        "INSERT INTO tags (user_id, tag_name, tag_uuid) VALUES (?, ?, ?)"
                    ).bind(user.id, tag_name, tagUuid).run();
                    
                    tag = await env.DB.prepare(
                        "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
                    ).bind(user.id, tag_name).first();
                    console.log(`创建新Tag: ${tag_name}, ID: ${tag.id}`);
                }

                let successCount = 0;
                let existingCount = 0;
                let failedCount = 0;
                const nodeIds = [];

                // 逐个处理节点，提供详细的错误信息
                for (const nodeUrl of nodes) {
                    if (!nodeUrl || typeof nodeUrl !== 'string') {
                        failedCount++;
                        continue;
                    }
                    
                    const trimmedUrl = nodeUrl.trim();
                    console.log(`处理节点: ${trimmedUrl.substring(0, 50)}...`);
                    
                    // 先检查节点是否已存在（使用URL直接匹配，避免hash问题）
                    const existingNode = await env.DB.prepare(
                        "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
                    ).bind(user.id, trimmedUrl).first();
                    
                    let nodeId;
                    if (existingNode) {
                        nodeId = existingNode.id;
                        existingCount++;
                        console.log(`节点已存在，ID: ${nodeId}`);
                    } else {
                        // 创建新节点
                        const hash = generateSimpleHash(trimmedUrl);
                        if (!hash) {
                            console.log(`生成hash失败: ${trimmedUrl}`);
                            failedCount++;
                            continue;
                        }
                        
                        console.log(`生成hash: ${hash}`);
                        
                        try {
                            const insertResult = await env.DB.prepare(
                                "INSERT INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, 'pending')"
                            ).bind(user.id, null, trimmedUrl, hash).run();
                            
                            if (insertResult.success && insertResult.meta.last_row_id) {
                                nodeId = insertResult.meta.last_row_id;
                                successCount++;
                                console.log(`成功创建节点，ID: ${nodeId}`);
                            } else {
                                console.log(`节点插入失败: ${JSON.stringify(insertResult)}`);
                                failedCount++;
                                continue;
                            }
                        } catch (insertError) {
                            if (insertError.message.includes('UNIQUE constraint failed')) {
                                // Hash冲突，尝试查找现有节点
                                const conflictNode = await env.DB.prepare(
                                    "SELECT id FROM node_pool WHERE user_id = ? AND node_hash = ?"
                                ).bind(user.id, hash).first();
                                
                                if (conflictNode) {
                                    nodeId = conflictNode.id;
                                    existingCount++;
                                    console.log(`Hash冲突，使用现有节点ID: ${nodeId}`);
                                } else {
                                    console.log(`Hash冲突但找不到现有节点: ${hash}`);
                                    failedCount++;
                                    continue;
                                }
                            } else {
                                console.error(`节点插入错误: ${insertError.message}`);
                                failedCount++;
                                continue;
                            }
                        }
                    }
                    
                    if (nodeId) {
                        nodeIds.push(nodeId);
                    }
                }

                console.log(`节点处理完成: 成功${successCount}, 已存在${existingCount}, 失败${failedCount}`);

                // 批量创建Tag映射
                let mappingCount = 0;
                if (nodeIds.length > 0) {
                    const tagMapStatements = [];
                    for (const nodeId of nodeIds) {
                        tagMapStatements.push(
                            env.DB.prepare(
                                "INSERT OR IGNORE INTO node_tag_map (tag_id, node_id) VALUES (?, ?)"
                            ).bind(tag.id, nodeId)
                        );
                    }
                    
                    const batchResult = await env.DB.batch(tagMapStatements);
                    mappingCount = nodeIds.length;
                    console.log(`创建Tag映射: ${mappingCount}个`);
                }

                const totalProcessed = successCount + existingCount;
                return new Response(JSON.stringify({ 
                    message: `成功将 ${totalProcessed} 个节点添加到Tag '${tag_name}'`,
                    added_count: totalProcessed,
                    details: {
                        new_nodes: successCount,
                        existing_nodes: existingCount,
                        failed_nodes: failedCount,
                        total_processed: nodes.length
                    }
                }), { status: 200 });

            } catch (e) {
                console.error('添加节点到Tag失败:', e);
                return new Response(JSON.stringify({ 
                    error: `操作失败: ${e.message}`,
                    stack: e.stack 
                }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 更新节点状态 (POST /api/nodes/update-status) - 受保护
        if (url.pathname === '/api/nodes/update-status' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { nodes, mark_others_failed } = await request.json();
                if (!nodes || !Array.isArray(nodes)) {
                    return new Response(JSON.stringify({ error: '节点列表不能为空' }), { status: 400 });
                }

                const activeHashes = [];
                for (const nodeUrl of nodes) {
                    if (nodeUrl && typeof nodeUrl === 'string') {
                        const hash = generateSimpleHash(nodeUrl);
                        if (hash) {
                            activeHashes.push(hash);
                        }
                    }
                }

                if (activeHashes.length === 0) {
                    return new Response(JSON.stringify({ error: '没有有效的节点' }), { status: 400 });
                }

                const statements = [];

                for (const hash of activeHashes) {
                    statements.push(
                        env.DB.prepare(
                            "UPDATE node_pool SET status = 'active', last_test_at = ? WHERE user_id = ? AND node_hash = ?"
                        ).bind(new Date().toISOString(), user.id, hash)
                    );
                }

                if (mark_others_failed) {
                    const hashPlaceholders = activeHashes.map(() => '?').join(',');
                    statements.push(
                        env.DB.prepare(
                            `UPDATE node_pool SET status = 'failed', last_test_at = ? WHERE user_id = ? AND node_hash NOT IN (${hashPlaceholders})`
                        ).bind(new Date().toISOString(), user.id, ...activeHashes)
                    );
                }

                await env.DB.batch(statements);

                return new Response(JSON.stringify({ 
                    message: `成功更新 ${activeHashes.length} 个节点状态为可用`,
                    updated_count: activeHashes.length 
                }), { status: 200 });

            } catch (e) {
                console.error('更新节点状态失败:', e);
                return new Response(JSON.stringify({ error: `更新失败: ${e.message}` }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 订阅源管理路由 =========================================================

        // 路由: 获取订阅源列表 (GET /api/subscription-sources) - 受保护
        if (url.pathname === '/api/subscription-sources' && request.method === 'GET') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { results } = await env.DB.prepare(
                    "SELECT id, source_name, source_url, fetch_status, node_count, last_fetch_at FROM subscription_sources WHERE user_id = ? ORDER BY created_at DESC"
                ).bind(user.id).all();

                return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                console.error('获取订阅源失败:', e);
                if (e.message.includes('no such table')) {
                    return new Response(JSON.stringify({ error: '数据库表不存在，请确保已创建subscription_sources表' }), { 
                        status: 500, headers: { 'Content-Type': 'application/json' } 
                    });
                }
                return new Response(JSON.stringify({ error: `数据库错误: ${e.message}` }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 添加订阅源 (POST /api/subscription-sources) - 受保护
        if (url.pathname === '/api/subscription-sources' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { source_name, source_url } = await request.json();
                if (!source_name || !source_url || !source_url.startsWith('http')) {
                    return new Response(JSON.stringify({ error: '名称和有效的URL不能为空' }), { status: 400 });
                }
                
                await env.DB.prepare(
                    "INSERT INTO subscription_sources (user_id, source_name, source_url) VALUES (?, ?, ?)"
                ).bind(user.id, source_name, source_url).run();

                return new Response(JSON.stringify({ message: '订阅源添加成功！' }), { status: 201 });
            } catch (e) {
                console.error('添加订阅源失败:', e);
                if (e.message.includes('no such table')) {
                    return new Response(JSON.stringify({ error: '数据库表不存在，请确保已创建subscription_sources表' }), { 
                        status: 500, headers: { 'Content-Type': 'application/json' } 
                    });
                }
                return new Response(JSON.stringify({ error: `数据库错误: ${e.message}` }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 删除订阅源 (DELETE /api/subscription-sources/:id) - 受保护
        if (url.pathname.startsWith('/api/subscription-sources/') && request.method === 'DELETE' && !url.pathname.includes('/refresh')) {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json' } 
                });

                const sourceId = url.pathname.split('/')[3];
                if (!sourceId || isNaN(parseInt(sourceId))) {
                    return new Response(JSON.stringify({ error: '无效的订阅源ID' }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }

                // 验证订阅源所有权
                const source = await env.DB.prepare(
                    "SELECT id, source_name FROM subscription_sources WHERE user_id = ? AND id = ?"
                ).bind(user.id, parseInt(sourceId)).first();

                if (!source) {
                    return new Response(JSON.stringify({ error: '订阅源不存在或无权限删除' }), { 
                        status: 404, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }

                // 按正确顺序删除：先删除子表（node_pool），再删除父表（subscription_sources）
                // 这样可以避免外键约束错误
                const deleteResult = await env.DB.batch([
                    // 1. 先删除node_tag_map中的映射关系
                    env.DB.prepare(`
                        DELETE FROM node_tag_map 
                        WHERE node_id IN (
                            SELECT id FROM node_pool 
                            WHERE user_id = ? AND source_id = ?
                        )
                    `).bind(user.id, parseInt(sourceId)),
                    // 2. 再删除node_pool中的节点
                    env.DB.prepare("DELETE FROM node_pool WHERE user_id = ? AND source_id = ?").bind(user.id, parseInt(sourceId)),
                    // 3. 最后删除subscription_sources中的订阅源
                    env.DB.prepare("DELETE FROM subscription_sources WHERE user_id = ? AND id = ?").bind(user.id, parseInt(sourceId))
                ]);
                
                return new Response(JSON.stringify({ 
                    message: `订阅源 "${source.source_name}" 及相关节点已删除` 
                }), { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' } 
                });

            } catch (e) {
                console.error('删除订阅源失败:', e);
                return new Response(JSON.stringify({ 
                    error: `删除失败: ${e.message}` 
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 路由: 刷新订阅源 (POST /api/subscription-sources/:id/refresh) - 受保护
        if (url.pathname.includes('/refresh') && request.method === 'POST') {
            const user = await getUserBySession(request, env);
            if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
            
            const sourceId = url.pathname.split('/')[3];
            const source = await env.DB.prepare(
                "SELECT * FROM subscription_sources WHERE id = ? AND user_id = ?"
            ).bind(sourceId, user.id).first();
            
            if (!source) return new Response(JSON.stringify({ error: '订阅源不存在' }), { status: 404 });
            
            ctx.waitUntil(refreshSubscriptionSource(source, env));

            return new Response(JSON.stringify({ message: `已开始刷新 '${source.source_name}', 请稍后查看结果。` }));
        }

        // 路由: 创建/更新订阅 (POST /api/create-sub) - 受保护
        if (url.pathname === '/api/create-sub' && request.method === 'POST') {
            const user = await getUserBySession(request, env);
            if (!user) {
                return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            const { nodes } = await request.json();
            const encodedNodes = safeBase64Encode(nodes);
            const now = new Date().toISOString();
            let sub = await env.DB.prepare("SELECT uuid FROM subscriptions WHERE user_id = ?").bind(user.id).first();
            if (sub) {
                await env.DB.prepare("UPDATE subscriptions SET node_data_base64 = ?, updated_at = ? WHERE user_id = ?").bind(encodedNodes, now, user.id).run();
            } else {
                const newUuid = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO subscriptions (user_id, uuid, node_data_base64, updated_at) VALUES (?, ?, ?, ?)").bind(user.id, newUuid, encodedNodes, now).run();
                sub = { uuid: newUuid };
            }
            return new Response(JSON.stringify({ subscriptionUrl: `${url.origin}/sub/${sub.uuid}` }), { headers: { 'Content-Type': 'application/json' } });
        }

        // 路由: 节点批量操作 (POST /api/nodes/batch-operate) - 受保护
        if (url.pathname === '/api/nodes/batch-operate' && request.method === 'POST') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { tag_ids, nodes, action } = await request.json();
                
                // 验证参数
                if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
                    return new Response(JSON.stringify({ error: 'Tag ID列表不能为空' }), { status: 400 });
                }
                
                if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
                    return new Response(JSON.stringify({ error: '节点列表不能为空' }), { status: 400 });
                }
                
                if (!action || !['add', 'delete'].includes(action)) {
                    return new Response(JSON.stringify({ error: '操作类型无效' }), { status: 400 });
                }

                // 验证Tag所有权
                const { results: userTags } = await env.DB.prepare(
                    `SELECT id, tag_name FROM tags WHERE user_id = ? AND id IN (${tag_ids.map(() => '?').join(',')})`
                ).bind(user.id, ...tag_ids).all();
                
                if (userTags.length !== tag_ids.length) {
                    return new Response(JSON.stringify({ error: '部分Tag不存在或无权限' }), { status: 403 });
                }

                const results = [];
                const tagMap = new Map(userTags.map(tag => [tag.id, tag.tag_name]));

                if (action === 'add') {
                    // 添加节点到Tag
                    for (const tagId of tag_ids) {
                        const tagName = tagMap.get(tagId);
                        let addedCount = 0;
                        let existingCount = 0;

                        for (const nodeUrl of nodes) {
                            const trimmedUrl = nodeUrl.trim();
                            console.log(`添加操作：处理节点 ${trimmedUrl.substring(0, 50)}...`);

                            // 先使用URL直接匹配检查节点是否已存在
                            let node = await env.DB.prepare(
                                "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
                            ).bind(user.id, trimmedUrl).first();

                            if (!node) {
                                // 创建新节点时需要指定source_id，使用null表示手动添加
                                const nodeHash = generateSimpleHash(trimmedUrl);
                                if (!nodeHash) {
                                    console.log(`生成hash失败: ${trimmedUrl}`);
                                    continue;
                                }
                                
                                try {
                                    const insertResult = await env.DB.prepare(
                                        "INSERT INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, 'untested')"
                                    ).bind(user.id, null, trimmedUrl, nodeHash).run();
                                    
                                    if (insertResult.success && insertResult.meta.last_row_id) {
                                        node = { id: insertResult.meta.last_row_id };
                                        console.log(`成功创建节点: ${nodeHash}`);
                                    } else {
                                        console.error(`节点创建失败: ${nodeHash}`, insertResult);
                                        continue; // 跳过这个节点
                                    }
                                } catch (insertError) {
                                    if (insertError.message.includes('UNIQUE constraint failed')) {
                                        // Hash冲突，尝试查找现有节点
                                        const conflictNode = await env.DB.prepare(
                                            "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
                                        ).bind(user.id, trimmedUrl).first();
                                        
                                        if (conflictNode) {
                                            node = conflictNode;
                                            console.log(`Hash冲突，使用现有节点ID: ${node.id}`);
                                        } else {
                                            console.error(`节点插入错误: ${nodeHash}`, insertError);
                                            continue; // 跳过这个节点
                                        }
                                    } else {
                                        console.error(`节点插入错误: ${nodeHash}`, insertError);
                                        continue; // 跳过这个节点
                                    }
                                }
                            } else {
                                console.log(`节点已存在，ID: ${node.id}`);
                            }

                            // 检查是否已在Tag中
                            const existing = await env.DB.prepare(
                                "SELECT id FROM node_tag_map WHERE node_id = ? AND tag_id = ?"
                            ).bind(node.id, tagId).first();

                            if (!existing) {
                                // 添加到Tag
                                await env.DB.prepare(
                                    "INSERT INTO node_tag_map (node_id, tag_id) VALUES (?, ?)"
                                ).bind(node.id, tagId).run();
                                addedCount++;
                            } else {
                                existingCount++;
                            }
                        }

                        if (addedCount > 0 && existingCount > 0) {
                            results.push(`${tagName}: 添加了 ${addedCount} 个节点，${existingCount} 个已存在`);
                        } else if (addedCount > 0) {
                            results.push(`${tagName}: 添加了 ${addedCount} 个节点`);
                        } else if (existingCount > 0) {
                            results.push(`${tagName}: ${existingCount} 个节点已存在`);
                        }
                    }
                } else if (action === 'delete') {
                    // 从Tag删除节点
                    for (const tagId of tag_ids) {
                        const tagName = tagMap.get(tagId);
                        let deletedCount = 0;
                        let notInTagCount = 0;
                        let nodeNotExistCount = 0;

                        for (const nodeUrl of nodes) {
                            const trimmedUrl = nodeUrl.trim();
                            console.log(`删除操作：查找节点 ${trimmedUrl.substring(0, 50)}...`);

                            // 先使用URL直接匹配查找节点（避免hash问题）
                            const node = await env.DB.prepare(
                                "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
                            ).bind(user.id, trimmedUrl).first();

                            if (node) {
                                console.log(`找到节点，ID: ${node.id}`);
                                
                                // 先检查节点是否真的在Tag中（调试用）
                                console.log(`调试信息：节点ID=${node.id} (类型: ${typeof node.id}), TagID=${tagId} (类型: ${typeof tagId})`);
                                
                                const checkMapping = await env.DB.prepare(
                                    "SELECT id, node_id, tag_id FROM node_tag_map WHERE node_id = ? AND tag_id = ?"
                                ).bind(node.id, tagId).first();
                                console.log(`删除前检查：节点 ${node.id} 在Tag ${tagId} 中的映射:`, checkMapping ? '存在' : '不存在');
                                
                                // 额外检查：查看这个节点在哪些Tag中
                                const allMappings = await env.DB.prepare(
                                    "SELECT tag_id FROM node_tag_map WHERE node_id = ?"
                                ).bind(node.id).all();
                                console.log(`节点 ${node.id} 的所有Tag映射:`, allMappings.results.map(r => r.tag_id));
                                
                                // 直接尝试删除，根据删除结果统计
                                const deleteResult = await env.DB.prepare(
                                    "DELETE FROM node_tag_map WHERE node_id = ? AND tag_id = ?"
                                ).bind(node.id, tagId).run();

                                const actualChanges = deleteResult.meta?.changes || deleteResult.changes || 0;
                                console.log(`删除结果详情:`, {
                                    success: deleteResult.success,
                                    changes: deleteResult.changes,
                                    meta_changes: deleteResult.meta?.changes,
                                    actual_changes: actualChanges,
                                    meta: deleteResult.meta
                                });

                                if (actualChanges > 0) {
                                    deletedCount++;
                                    console.log(`✅ 成功从Tag删除节点 ${node.id}，changes: ${actualChanges}`);
                                } else {
                                    notInTagCount++;
                                    console.log(`❌ 节点 ${node.id} 删除失败，changes: ${actualChanges}，可能不在Tag ${tagId} 中`);
                                }
                            } else {
                                nodeNotExistCount++;
                                console.log(`未找到节点: ${trimmedUrl.substring(0, 50)}...`);
                            }
                        }

                        console.log(`Tag ${tagName} 删除统计: 成功删除 ${deletedCount} 个，不在Tag中 ${notInTagCount} 个，节点不存在 ${nodeNotExistCount} 个`);
                        
                        // 简化提示逻辑：优先显示成功信息
                        if (deletedCount === nodes.length) {
                            // 所有节点都删除成功
                            results.push(`${tagName}: 成功删除 ${deletedCount} 个节点`);
                        } else if (deletedCount > 0) {
                            // 部分节点删除成功
                            const failureDetails = [];
                            if (notInTagCount > 0) failureDetails.push(`${notInTagCount}个不在此Tag中`);
                            if (nodeNotExistCount > 0) failureDetails.push(`${nodeNotExistCount}个节点不存在`);
                            results.push(`${tagName}: 成功删除 ${deletedCount} 个节点，${failureDetails.join('，')}`);
                        } else {
                            // 没有删除任何节点的情况
                            if (notInTagCount > 0 && nodeNotExistCount > 0) {
                                results.push(`${tagName}: ${notInTagCount} 个节点不在此Tag中，${nodeNotExistCount} 个节点不存在`);
                            } else if (notInTagCount > 0) {
                                results.push(`${tagName}: ${notInTagCount} 个节点不在此Tag中`);
                            } else if (nodeNotExistCount > 0) {
                                results.push(`${tagName}: ${nodeNotExistCount} 个节点不存在`);
                            } else {
                                results.push(`${tagName}: 没有节点需要删除`);
                            }
                        }
                    }
                }

                const actionText = action === 'add' ? '添加' : '删除';
                return new Response(JSON.stringify({
                    message: `批量${actionText}操作完成！`,
                    details: results
                }), { 
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (e) {
                console.error('批量操作失败:', e);
                return new Response(JSON.stringify({ 
                    error: `批量操作失败: ${e.message}` 
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // 节点池管理路由 =========================================================

        // 路由: 获取节点池列表 (GET /api/nodes) - 受保护
        if (url.pathname === '/api/nodes' && request.method === 'GET') {
            try {
                const user = await getUserBySession(request, env);
                if (!user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });

                const { results } = await env.DB.prepare(
                    `SELECT 
                        p.id, p.node_url, p.created_at, s.source_name 
                     FROM 
                        node_pool p 
                     JOIN 
                        subscription_sources s ON p.source_id = s.id
                     WHERE 
                        p.user_id = ? 
                     ORDER BY s.source_name, p.id`
                ).bind(user.id).all();

                const nodesWithNames = results.map(node => {
                    const parsed = parseNodeLinkForConfig(node.node_url);
                    const protocol = node.node_url.split('://')[0] || 'unknown';
                    return {
                        ...node,
                        node_name: parsed ? parsed.name : '无法解析的节点',
                        protocol: protocol,
                        server: parsed ? parsed.server : 'unknown'
                    };
                });

                return new Response(JSON.stringify(nodesWithNames || []), { headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                console.error('获取节点池失败:', e);
                if (e.message.includes('no such table')) {
                    return new Response(JSON.stringify({ error: '数据库表不存在，请确保已创建node_pool表' }), { 
                        status: 500, headers: { 'Content-Type': 'application/json' } 
                    });
                }
                return new Response(JSON.stringify({ error: `数据库错误: ${e.message}` }), { 
                    status: 500, headers: { 'Content-Type': 'application/json' } 
                });
            }
        }
        
        // 核心服务路由 =========================================================

        // 路由: 提供订阅内容 (GET /sub/:uuid 或 /sub/tag/:tag_uuid)
        if (url.pathname.startsWith('/sub/')) {
            const pathParts = url.pathname.split('/');
            let nodeUrls = [];
            
            if (pathParts[2] === 'tag' && pathParts[3]) {
                const tagUuid = pathParts[3];
                try {
                    const { results } = await env.DB.prepare(`
                        SELECT np.node_url 
                        FROM tags t
                        JOIN node_tag_map ntm ON t.id = ntm.tag_id
                        JOIN node_pool np ON ntm.node_id = np.id
                        WHERE t.tag_uuid = ? AND np.status != 'failed'
                        ORDER BY np.created_at DESC
                    `).bind(tagUuid).all();
                    
                    if (!results || results.length === 0) {
                        return new Response('Tag subscription not found or is empty', { status: 404 });
                    }
                    
                    nodeUrls = results.map(r => r.node_url);
                } catch (e) {
                    console.error('Tag subscription error:', e);
                    return new Response('Tag subscription error', { status: 500 });
                }
            } else {
                const subUuid = pathParts[2];
                const sub = await env.DB.prepare("SELECT node_data_base64 FROM subscriptions WHERE uuid = ?").bind(subUuid).first();
                if (!sub || !sub.node_data_base64) {
                    return new Response('Subscription not found or is empty', { status: 404 });
                }
                const nodesString = safeBase64Decode(sub.node_data_base64);
                nodeUrls = nodesString.split('\n').filter(Boolean);
            }
            
            const formatType = url.searchParams.get('type') || 'base64';
            
            if (formatType === 'base64') {
                const encodedNodes = safeBase64Encode(nodeUrls.join('\n'));
                return new Response(encodedNodes, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
            }
            
            if (formatType === 'clash') {
                const proxies = nodeUrls.map(parseNodeLinkForConfig).filter(Boolean);
                if (proxies.length === 0) {
                    return new Response('No valid nodes found for Clash format', { status: 404 });
                }
                const proxyNames = proxies.map(p => p.name);
                let clashConfig = clashConfigTemplate
                    .replace('##PROXIES##', proxies.map(p => `  - ${JSON.stringify(p)}`).join('\n'))
                    .replace(/##PROXY_NAMES##/g, proxyNames.map(name => `      - "${name}"`).join('\n'));
                return new Response(clashConfig, { headers: { 'Content-Type': 'text/yaml;charset=utf-8' } });
            }
            
            return new Response(`Unsupported format type: ${formatType}`, { status: 400 });
        }

        // 默认路由: 提供静态文件
        return env.ASSETS.fetch(request);
    }
};