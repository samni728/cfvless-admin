// =================================================================================
// 基础 NAT64 VLESS Worker 脚本 - 严格按照参考代码实现
// UUID: 728add07-eda9-4447-bde4-3f76d8db020f
// 参考: cf-vless/_workernat64.js
// =================================================================================

import { connect } from "cloudflare:sockets";

const WS_READY_STATE_OPEN = 1;
let userID = "728add07-eda9-4447-bde4-3f76d8db020f";
const cn_hostnames = [""];

// 使用参考代码中的 CDNIP 配置
let CDNIP = "\u0077\u0077\u0077\u002e\u0076\u0069\u0073\u0061\u002e\u0063\u006f\u006d\u002e\u0073\u0067";

// 辅助函数
function safeCloseWebSocket(socket) {
    try {
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close();
        }
    } catch (error) {
        console.error('safeCloseWebSocket error', error);
    }
}

// Base64 解码函数
function base64ToArrayBuffer(base64Str) {
    if (!base64Str) {
        return { error: null };
    }
    try {
        base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
        const decode = atob(base64Str);
        const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
        return { earlyData: arryBuffer.buffer, error: null };
    } catch (error) {
        return { error };
    }
}

// UUID 字符串化函数
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).slice(1));
}

function unsafeStringify(arr, offset = 0) {
    return (
        byteToHex[arr[offset + 0]] +
        byteToHex[arr[offset + 1]] +
        byteToHex[arr[offset + 2]] +
        byteToHex[arr[offset + 3]] +
        '-' +
        byteToHex[arr[offset + 4]] +
        byteToHex[arr[offset + 5]] +
        '-' +
        byteToHex[arr[offset + 6]] +
        byteToHex[arr[offset + 7]] +
        '-' +
        byteToHex[arr[offset + 8]] +
        byteToHex[arr[offset + 9]] +
        '-' +
        byteToHex[arr[offset + 10]] +
        byteToHex[arr[offset + 11]] +
        byteToHex[arr[offset + 12]] +
        byteToHex[arr[offset + 13]] +
        byteToHex[arr[offset + 14]] +
        byteToHex[arr[offset + 15]]
    ).toLowerCase();
}

function stringify(arr, offset = 0) {
    const uuid = unsafeStringify(arr, offset);
    return uuid;
}

// VLESS 头部处理函数
async function processVlessHeader(vlessBuffer) {
    if (vlessBuffer.byteLength < 24) {
        return {
            hasError: true,
            message: 'invalid data',
        };
    }
    
    const version = new Uint8Array(vlessBuffer.slice(0, 1));
    let isValidUser = false;
    let isUDP = false;
    const slicedBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
    const slicedBufferString = stringify(slicedBuffer);

    // 验证用户UUID
    if (slicedBufferString === userID) {
        isValidUser = true;
    }

    if (!isValidUser) {
        return {
            hasError: true,
            message: 'invalid user',
        };
    }

    const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
    const command = new Uint8Array(vlessBuffer.slice(18 + optLength, 18 + optLength + 1))[0];

    // 0x01 TCP, 0x02 UDP, 0x03 MUX
    if (command === 1) {
        // TCP
    } else if (command === 2) {
        isUDP = true;
    } else {
        return {
            hasError: true,
            message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`,
        };
    }
    
    const portIndex = 18 + optLength + 1;
    const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);

    let addressIndex = portIndex + 2;
    const addressBuffer = new Uint8Array(vlessBuffer.slice(addressIndex, addressIndex + 1));

    const addressType = addressBuffer[0];
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    let addressValue = '';
    
    switch (addressType) {
        case 1:
            addressLength = 4;
            addressValue = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join('.');
            break;
        case 2:
            addressLength = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
            addressValueIndex += 1;
            addressValue = new TextDecoder().decode(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case 3:
            addressLength = 16;
            const dataView = new DataView(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
            const ipv6 = [];
            for (let i = 0; i < 8; i++) {
                ipv6.push(dataView.getUint16(i * 2).toString(16));
            }
            addressValue = ipv6.join(':');
            break;
        default:
            return {
                hasError: true,
                message: `invalid addressType is ${addressType}`,
            };
    }
    
    if (!addressValue) {
        return {
            hasError: true,
            message: `addressValue is empty, addressType is ${addressType}`,
        };
    }

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: addressValueIndex + addressLength,
        vlessVersion: version,
        isUDP,
    };
}

// 创建 WebSocket 可读流
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
    let readableStreamCancel = false;
    const stream = new ReadableStream({
        start(controller) {
            webSocketServer.addEventListener('message', (event) => {
                if (readableStreamCancel) {
                    return;
                }
                const message = event.data;
                controller.enqueue(message);
            });

            webSocketServer.addEventListener('close', () => {
                safeCloseWebSocket(webSocketServer);
                if (readableStreamCancel) {
                    return;
                }
                controller.close();
            });
            
            webSocketServer.addEventListener('error', (err) => {
                log('webSocketServer has error');
                controller.error(err);
            });
            
            // for ws 0rtt
            const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
            if (error) {
                controller.error(error);
            } else if (earlyData) {
                controller.enqueue(earlyData);
            }
        },

        pull(controller) {
            // if ws can stop read if stream is full, we can implement backpressure
        },
        cancel(reason) {
            if (readableStreamCancel) {
                return;
            }
            log(`ReadableStream was canceled, due to ${reason}`);
            readableStreamCancel = true;
            safeCloseWebSocket(webSocketServer);
        },
    });

    return stream;
}

// NAT64 IPv6地址转换函数
function convertToNAT64IPv6(ipv4Address) {
    const parts = ipv4Address.split('.');
    if (parts.length !== 4) {
        throw new Error('无效的IPv4地址');
    }

    const hex = parts.map(part => {
        const num = parseInt(part, 10);
        if (num < 0 || num > 255) {
            throw new Error('无效的IPv4地址段');
        }
        return num.toString(16).padStart(2, '0');
    });
    
    // 使用多个优质NAT64前缀，提高连接成功率
    const prefixes = [
        '64:ff9b::', // Google Public NAT64 (首选)
        '2001:67c:2b0::', // TREX.CZ (欧洲优质备选)
        '2001:67c:27e4:1064::', // go6lab (欧洲优质备选)
        '2602:fc59:b0:64::', // 原脚本中的服务 (保留作为备用)
    ];
    const chosenPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}

// 获取IPv6代理地址
async function getIPv6ProxyAddress(domain) {
    try {
        const dnsQuery = await fetch(
            `https://1.1.1.1/dns-query?name=${domain}&type=A`,
            {
                headers: {
                    Accept: 'application/dns-json',
                },
            }
        );

        const dnsResult = await dnsQuery.json();
        if (dnsResult.Answer && dnsResult.Answer.length > 0) {
            const aRecord = dnsResult.Answer.find(
                record => record.type === 1
            );
            if (aRecord) {
                const ipv4Address = aRecord.data;
                return convertToNAT64IPv6(ipv4Address);
            }
        }
        throw new Error('无法解析域名的IPv4地址');
    } catch (err) {
        throw new Error(`DNS解析失败: ${err.message}`);
    }
}

// 检查是否为 IPv4 地址
function isIPv4(address) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(address);
}

// 检查是否为Cloudflare CDN域名
function isCloudflareHost(hostname) {
    const cloudflareHosts = [
        'x.com', 'twitter.com',
        'openai.com', 'api.openai.com', 'chat.openai.com',
        'discord.com', 'discordapp.com',
        'github.com', 'api.github.com',
        'reddit.com', 'www.reddit.com',
        'medium.com',
        'notion.so', 'www.notion.so',
        'figma.com', 'www.figma.com'
    ];
    
    return cloudflareHosts.some(host => 
        hostname === host || hostname.endsWith('.' + host)
    );
}

// TCP 出站处理函数 - 增强NAT64支持
async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log) {
    async function connectAndWrite(address, port, isIPv6 = false) {
        let tcpSocket;
        if (isIPv6) {
            tcpSocket = connect({
                hostname: address,
                port: port,
            });
        } else {
            tcpSocket = connect({
                hostname: address,
                port: port,
            });
        }
        remoteSocket.value = tcpSocket;
        log(`connected to ${address}:${port}`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData);
        writer.releaseLock();
        return tcpSocket;
    }

    async function retry() {
        try {
            // NAT64 重试逻辑：如果直连失败，尝试通过 NAT64
            log(`开始 NAT64 重试连接到 ${addressRemote}:${portRemote}`);
            
            let nat64Address;
            try {
                // 尝试获取 IPv6 代理地址
                nat64Address = await getIPv6ProxyAddress(addressRemote);
                log(`NAT64 地址转换成功: ${addressRemote} -> ${nat64Address}`);
            } catch (error) {
                log(`NAT64 地址转换失败: ${error.message}`);
                // 如果 DNS 解析失败，使用默认的 NAT64 转换
                if (isIPv4(addressRemote)) {
                    nat64Address = convertToNAT64IPv6(addressRemote);
                    log(`使用默认 NAT64 转换: ${addressRemote} -> ${nat64Address}`);
                } else {
                    throw new Error(`无法为 ${addressRemote} 创建 NAT64 地址`);
                }
            }
            
            const tcpSocket = await connectAndWrite(nat64Address, portRemote, true);
            tcpSocket.closed
                .catch((error) => {
                    console.log('NAT64 retry tcpSocket closed error', error);
                })
                .finally(() => {
                    safeCloseWebSocket(webSocket);
                });
            remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
        } catch (error) {
            log(`NAT64 重试也失败: ${error.message}`);
            safeCloseWebSocket(webSocket);
        }
    }

    try {
        // 对于已知的Cloudflare CDN域名，直接使用NAT64
        if (isCloudflareHost(addressRemote)) {
            log(`检测到Cloudflare CDN域名 ${addressRemote}，直接使用NAT64`);
            await retry();
            return;
        }
        
        // 首先尝试直连
        const tcpSocket = await connectAndWrite(addressRemote, portRemote);
        remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
    } catch (error) {
        log(`直连失败: ${error.message}，准备 NAT64 重试`);
        await retry();
    }
}

// 远程 Socket 到 WebSocket 的数据转发
async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
    let vlessHeader = vlessResponseHeader;
    let hasIncomingData = false;

    await remoteSocket.readable
        .pipeTo(
            new WritableStream({
                start() {},
                async write(chunk, controller) {
                    hasIncomingData = true;
                    if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                        controller.error('webSocket.readyState is not open, maybe close');
                    }
                    if (vlessHeader) {
                        webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
                        vlessHeader = null;
                    } else {
                        webSocket.send(chunk);
                    }
                },
                close() {
                    log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
                },
                abort(reason) {
                    console.error(`remoteConnection!.readable abort`, reason);
                },
            })
        )
        .catch((error) => {
            console.error(`remoteSocketToWS has exception `, error.stack || error);
            safeCloseWebSocket(webSocket);
        });
}

// VLESS WebSocket 处理函数
async function handleVlessWebSocket(request) {
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();

    let address = '';
    let portWithRandomLog = '';
    const log = (info, event) => {
        console.log(`[${address}:${portWithRandomLog}] ${info}`, event || '');
    };
    const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';

    const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

    let remoteSocketWapper = { value: null };

    // ws --> remote
    readableWebSocketStream
        .pipeTo(
            new WritableStream({
                async write(chunk, controller) {
                    if (remoteSocketWapper.value) {
                        const writer = remoteSocketWapper.value.writable.getWriter();
                        await writer.write(chunk);
                        writer.releaseLock();
                        return;
                    }

                    const {
                        hasError,
                        message,
                        portRemote = 443,
                        addressRemote = '',
                        rawDataIndex,
                        vlessVersion = new Uint8Array([0, 0]),
                        isUDP,
                    } = await processVlessHeader(chunk);
                    
                    address = addressRemote;
                    portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? 'udp ' : 'tcp '} `;
                    
                    if (hasError) {
                        throw new Error(message);
                        return;
                    }
                    
                    // if UDP but port not DNS port, close it
                    if (isUDP) {
                        if (portRemote === 53) {
                            // DNS over UDP, handle it
                        } else {
                            throw new Error('UDP proxy only enable for DNS which is port 53');
                            return;
                        }
                    }
                    
                    const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
                    const rawClientData = chunk.slice(rawDataIndex);
                    
                    handleTCPOutBound(
                        remoteSocketWapper,
                        addressRemote,
                        portRemote,
                        rawClientData,
                        webSocket,
                        vlessResponseHeader,
                        log
                    );
                },
                close() {
                    log(`readableWebSocketStream is close`);
                },
                abort(reason) {
                    log(`readableWebSocketStream is abort`, JSON.stringify(reason));
                },
            })
        )
        .catch((err) => {
            log('readableWebSocketStream pipeTo error', err);
        });

    return new Response(null, {
        status: 101,
        webSocket: client,
    });
}


// 生成 VLESS 配置信息 - 严格按照参考代码格式
function getvlessConfig(userID, hostName) {
    const vlessMain = `vless://${userID}@${CDNIP}:8443?encryption=none&security=tls&sni=${hostName}&fp=randomized&type=ws&host=${hostName}&path=%2F%3Fed%3D2560#${hostName}`;
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CF-pages/workers/自定义域-vless+ws+tls节点</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .node-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .vless-link { background: #e9ecef; padding: 15px; border-radius: 5px; word-break: break-all; font-family: monospace; margin: 10px 0; }
        .copy-btn { background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin: 5px; }
        .copy-btn:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 CF-pages/workers/自定义域-vless+ws+tls节点</h1>
        </div>
        <div class="node-info">
            <h3>📋 节点链接</h3>
            <div class="vless-link">${vlessMain}</div>
            <button class="copy-btn" onclick="copyToClipboard('${vlessMain}')">📋 复制节点链接</button>
        </div>
        <div class="node-info">
            <h3>⚙️ 客户端参数</h3>
            <p><strong>地址:</strong> ${CDNIP}</p>
            <p><strong>端口:</strong> 8443</p>
            <p><strong>用户ID:</strong> ${userID}</p>
            <p><strong>传输协议:</strong> ws</p>
            <p><strong>伪装域名:</strong> ${hostName}</p>
            <p><strong>路径:</strong> /?ed=2560</p>
            <p><strong>传输安全:</strong> TLS</p>
            <p><strong>SNI:</strong> ${hostName}</p>
        </div>
    </div>
    <script>
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('节点链接已复制！');
            }).catch(() => {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert('节点链接已复制！');
            });
        }
    </script>
</body>
</html>`;
}

// 主要的 Worker 导出 - 严格按照参考代码逻辑
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const hostname = request.headers.get('Host');
        
        // WebSocket 升级请求处理
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader && upgradeHeader === 'websocket') {
            return await handleVlessWebSocket(request);
        }

        // 路由处理 - 严格按照参考代码
        switch (url.pathname) {
            case `/${userID}`: {
                return new Response(getvlessConfig(userID, hostname), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            }
            default: {
                // 默认路由返回 request.cf 信息
                return new Response(JSON.stringify(request.cf, null, 4), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json;charset=utf-8',
                    },
                });
            }
        }
    }
};