// =================================================================================
// _worker.js V2.0 FINAL - Correct Structure
// 备注：增加了节点管理和导入功能
// =================================================================================

import { connect } from "cloudflare:sockets";

// =================================================================================
// 用户配置区域 - 可直接修改
// =================================================================================

// ProxyIP 配置 - 用户可以修改为自己的 ProxyIP 地址
const DEFAULT_PROXY_IP = "129.159.84.71";

// 如果需要多个 ProxyIP，用逗号分隔，例如：
// const DEFAULT_PROXY_IP = '129.159.84.71,your.second.proxy.ip';

// =================================================================================

// =================================================================================
// 辅助函数和常量 - 必须在 export default 之前定义
// =================================================================================

// =================================================================================
// VLESS 代理核心功能 - 从参考项目复制
// =================================================================================

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

// VLESS WebSocket 处理函数 - 基于 BPB 真实实现
async function handleVlessWebSocket(request, env) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  // BPB 风格的全局变量初始化 - 完全照搬 BPB 的 init.js
  const url = new URL(request.url);
  globalThis.pathName = url.pathname;
  globalThis.hostName = request.headers.get("Host");
  globalThis.urlOrigin = url.origin;

  // BPB 的 ProxyIP 初始化逻辑 - 使用顶部配置的 ProxyIP
  globalThis.proxyIPs = DEFAULT_PROXY_IP;

  console.log(
    `BPB 风格初始化完成: pathName=${globalThis.pathName}, proxyIPs=${globalThis.proxyIPs}`
  );

  let address = "";
  let portWithRandomLog = "";
  const log = (info, event) => {
    console.log(`[${address}:${portWithRandomLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(
    webSocket,
    earlyDataHeader,
    log
  );

  let remoteSocketWapper = { value: null };
  let udpStreamWrite = null;
  let isDns = false;

  // ws --> remote
  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDns && udpStreamWrite) {
            return udpStreamWrite(chunk);
          }
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
            addressRemote = "",
            rawDataIndex,
            vlessVersion = new Uint8Array([0, 0]),
            isUDP,
          } = await processVlessHeader(chunk, env);

          address = addressRemote;
          portWithRandomLog = `${portRemote}--${Math.random()} ${
            isUDP ? "udp " : "tcp "
          } `;

          if (hasError) {
            throw new Error(message);
            return;
          }

          // if UDP but port not DNS port, close it
          if (isUDP) {
            if (portRemote === 53) {
              isDns = true;
            } else {
              throw new Error("UDP proxy only enable for DNS which is port 53");
              return;
            }
          }

          const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
          const rawClientData = chunk.slice(rawDataIndex);

          if (isDns) {
            const { write } = await handleUDPOutBound(
              webSocket,
              vlessResponseHeader,
              log
            );
            udpStreamWrite = write;
            udpStreamWrite(rawClientData);
            return;
          }

          // 使用 BPB 风格的连接处理（包含 ProxyIP 重试机制）
          log(`使用 BPB 风格连接处理: ${addressRemote}:${portRemote}`);
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
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// 创建 WebSocket 可读流
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });

      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });

      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
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

// VLESS 头部处理函数
async function processVlessHeader(vlessBuffer, env) {
  if (vlessBuffer.byteLength < 24) {
    return {
      hasError: true,
      message: "invalid data",
    };
  }

  const version = new Uint8Array(vlessBuffer.slice(0, 1));
  let isValidUser = false;
  let isUDP = false;
  const slicedBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
  const slicedBufferString = stringify(slicedBuffer);

  // 验证用户UUID - 从数据库中查找
  try {
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE user_uuid = ?"
    )
      .bind(slicedBufferString)
      .first();
    isValidUser = !!user;
  } catch (e) {
    console.error("UUID验证失败:", e);
    isValidUser = false;
  }

  if (!isValidUser) {
    return {
      hasError: true,
      message: "invalid user",
    };
  }

  const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
  const command = new Uint8Array(
    vlessBuffer.slice(18 + optLength, 18 + optLength + 1)
  )[0];

  // 0x01 TCP, 0x02 UDP, 0x03 MUX
  if (command === 1) {
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
  const addressBuffer = new Uint8Array(
    vlessBuffer.slice(addressIndex, addressIndex + 1)
  );

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";

  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      ).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + 1)
      )[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invild addressType is ${addressType}`,
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

// 辅助函数
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { error };
  }
}

function safeCloseWebSocket(socket) {
  try {
    if (
      socket.readyState === WS_READY_STATE_OPEN ||
      socket.readyState === WS_READY_STATE_CLOSING
    ) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}

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
    "-" +
    byteToHex[arr[offset + 4]] +
    byteToHex[arr[offset + 5]] +
    "-" +
    byteToHex[arr[offset + 6]] +
    byteToHex[arr[offset + 7]] +
    "-" +
    byteToHex[arr[offset + 8]] +
    byteToHex[arr[offset + 9]] +
    "-" +
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

// BPB 风格：不需要复杂的 ProxyIP 检测逻辑
// BPB 的实现更简单：直连失败时自动使用 ProxyIP 重试

// BPB 风格的 TCP 出站处理函数 - 完全基于真实 BPB 源码
async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  vlessResponseHeader,
  log
) {
  async function connectAndWrite(address, port) {
    // BPB 的 IPv4 地址处理逻辑 - 完全照搬 BPB 源码
    if (
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
        address
      )
    ) {
      address = `${atob("d3d3Lg==")}${address}${atob("LnNzbGlwLmlv")}`;
    }

    const tcpSocket = connect({
      hostname: address,
      port: port,
    });
    remoteSocket.value = tcpSocket;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData); // first write, normal is tls client hello
    writer.releaseLock();
    return tcpSocket;
  }

  // BPB 的 ProxyIP 重试逻辑 - 完全照搬 BPB 源码
  async function retry() {
    let proxyIP, proxyIpPort;
    const encodedPanelProxyIPs = globalThis.pathName.split("/")[2] || "";
    const decodedProxyIPs = encodedPanelProxyIPs
      ? atob(encodedPanelProxyIPs)
      : globalThis.proxyIPs;
    const proxyIpList = decodedProxyIPs.split(",").map((ip) => ip.trim());
    const selectedProxyIP =
      proxyIpList[Math.floor(Math.random() * proxyIpList.length)];

    if (selectedProxyIP.includes("]:")) {
      const match = selectedProxyIP.match(/^(\[.*?\]):(\d+)$/);
      proxyIP = match[1];
      proxyIpPort = match[2];
    } else {
      [proxyIP, proxyIpPort] = selectedProxyIP.split(":");
    }

    const tcpSocket = await connectAndWrite(
      proxyIP || addressRemote,
      +proxyIpPort || portRemote
    );

    // no matter retry success or not, close websocket
    tcpSocket.closed
      .catch((error) => {
        console.log("retry tcpSocket closed error", error);
      })
      .finally(() => {
        safeCloseWebSocket(webSocket);
      });

    remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);

  // when remoteSocket is ready, pass to websocket
  // remote--> ws
  remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
}

// 检查是否为 IPv4 地址
function isIPv4(address) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Regex.test(address);
}

// 远程 Socket 到 WebSocket 的数据转发
async function remoteSocketToWS(
  remoteSocket,
  webSocket,
  vlessResponseHeader,
  retry,
  log
) {
  let remoteChunkCount = 0;
  let chunks = [];
  let vlessHeader = vlessResponseHeader;
  let hasIncomingData = false;

  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk, controller) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error("webSocket.readyState is not open, maybe close");
          }
          if (vlessHeader) {
            webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
            vlessHeader = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {
          log(
            `remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`
          );
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

  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}

// UDP 出站处理函数
async function handleUDPOutBound(webSocket, vlessResponseHeader, log) {
  let isVlessHeaderSent = false;
  const transformStream = new TransformStream({
    start(controller) {},
    transform(chunk, controller) {
      for (let index = 0; index < chunk.byteLength; ) {
        const lengthBuffer = chunk.slice(index, index + 2);
        const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
        const udpData = new Uint8Array(
          chunk.slice(index + 2, index + 2 + udpPakcetLength)
        );
        index = index + 2 + udpPakcetLength;
        controller.enqueue(udpData);
      }
    },
    flush(controller) {},
  });

  transformStream.readable
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          const resp = await fetch("https://1.1.1.1/dns-query", {
            method: "POST",
            headers: {
              "content-type": "application/dns-message",
            },
            body: chunk,
          });
          const dnsQueryResult = await resp.arrayBuffer();
          const udpSize = dnsQueryResult.byteLength;
          const udpSizeBuffer = new Uint8Array([
            (udpSize >> 8) & 0xff,
            udpSize & 0xff,
          ]);
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            log(`doh success and dns message length is ${udpSize}`);
            if (isVlessHeaderSent) {
              webSocket.send(
                await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer()
              );
            } else {
              webSocket.send(
                await new Blob([
                  vlessResponseHeader,
                  udpSizeBuffer,
                  dnsQueryResult,
                ]).arrayBuffer()
              );
              isVlessHeaderSent = true;
            }
          }
        },
      })
    )
    .catch((error) => {
      log("dns udp has error" + error);
    });

  const writer = transformStream.writable.getWriter();

  return {
    write(chunk) {
      writer.write(chunk);
    },
  };
}

// =================================================================================
// 源节点生成器功能 - NAT64 和 ProxyIP
// =================================================================================

/**
 * 生成一个参数完全符合 cf-vless 脚本反检测逻辑的 NAT64 VLESS 节点。
 * 该函数采用直连模式，Address、SNI 和 Host 均使用实际的 Pages 域名。
 * @param {string} uuid 用户的 UUID.
 * @param {string} actualPagesDomain 用户实际部署的 Pages 域名 (e.g., "fq88-2wy.pages.dev").
 * @returns {string} 一个完整的、可用的 VLESS 链接.
 */
function generateSimpleNAT64Node(uuid, actualPagesDomain) {
  const port = 443; // 使用 443 或其他受支持的 HTTPS 端口
  const nodeName = actualPagesDomain; // 使用域名作为节点名，简洁明了

  // 关键：严格遵循可用节点的参数，特别是 fp="randomized" 和 path="...ed=2560"
  return `vless://${uuid}@${actualPagesDomain}:${port}?encryption=none&security=tls&sni=${actualPagesDomain}&fp=randomized&type=ws&host=${actualPagesDomain}&path=%2F%3Fed%3D2560#${nodeName}`;
}

// NAT64 IPv6地址转换函数 - 从简版集成
function convertToNAT64IPv6(ipv4Address) {
  const parts = ipv4Address.split(".");
  if (parts.length !== 4) {
    throw new Error("无效的IPv4地址");
  }

  const hex = parts.map((part) => {
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) {
      throw new Error("无效的IPv4地址段");
    }
    return num.toString(16).padStart(2, "0");
  });

  // 创建一个包含多个优质NAT64前缀的列表，按推荐度排序
  const prefixes = [
    "64:ff9b::", // 1. Google Public NAT64 (首选)
    "2001:67c:2b0::", // 2. TREX.CZ (欧洲优质备选)
    "2001:67c:27e4:1064::", // 3. go6lab (欧洲优质备选)
    "2602:fc59:b0:64::", // 4. 您原来脚本中的服务 (保留作为备用)
  ];
  const chosenPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}

// 获取IPv6代理地址 - 从简版集成
async function getIPv6ProxyAddress(domain) {
  try {
    const dnsQuery = await fetch(
      `https://1.1.1.1/dns-query?name=${domain}&type=A`,
      {
        headers: {
          Accept: "application/dns-json",
        },
      }
    );

    const dnsResult = await dnsQuery.json();
    if (dnsResult.Answer && dnsResult.Answer.length > 0) {
      const aRecord = dnsResult.Answer.find((record) => record.type === 1);
      if (aRecord) {
        const ipv4Address = aRecord.data;
        return convertToNAT64IPv6(ipv4Address);
      }
    }
    throw new Error("无法解析域名的IPv4地址");
  } catch (err) {
    throw new Error(`DNS解析失败: ${err.message}`);
  }
}

// 删除重复的isIPv4函数定义 - 这个函数已经在前面定义过了

// ProxyIP 源节点生成函数 - 基于 BPB 实现，输出v2rayN标准格式
function generateProxyIPSourceNode(config_data) {
  const {
    uuid,
    domain,
    proxyIPs = [DEFAULT_PROXY_IP], // BPB 默认 ProxyIP 地址，在文件顶部配置
    port = 443,
    fingerprint = "randomized", // BPB 默认指纹
    alpn = "http/1.1", // BPB 默认 ALPN
  } = config_data;

  if (!uuid || !domain) {
    throw new Error("UUID 和域名是必需的参数");
  }

  // BPB 的 getRandomPath 函数 - 完全照搬源码
  function getRandomPath(length) {
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  // BPB 的 buildConfig 函数逻辑 - 完全照搬 normalConfigs.js
  const isTLS =
    port === 443 ||
    port === 8443 ||
    port === 2053 ||
    port === 2083 ||
    port === 2087 ||
    port === 2096;
  const security = isTLS ? "tls" : "none";

  // BPB 关键：路径生成逻辑
  const path = `${getRandomPath(16)}${
    proxyIPs.length ? `/${btoa(proxyIPs.join(","))}` : ""
  }`;
  const fullPath = `/${path}?ed=2560`;

  console.log(
    `生成 BPB ProxyIP 节点: path=${fullPath}, proxyIPs=${proxyIPs.join(",")}`
  );

  // 直接构建标准格式的URL字符串，确保与v2rayN导出格式完全一致
  // 参数顺序：encryption -> security -> sni -> alpn -> fp -> type -> host -> path
  const params = [];
  params.push(`encryption=none`);
  params.push(`security=${security}`);

  if (isTLS) {
    params.push(`sni=${domain}`);
    params.push(`alpn=${encodeURIComponent(alpn)}`); // 保持编码一致性
    params.push(`fp=${fingerprint}`);
  }

  params.push(`type=ws`);
  params.push(`host=${domain}`);
  params.push(`path=${encodeURIComponent(fullPath)}`); // 保持路径编码一致性

  const hashPart = `BPB-ProxyIP-${domain}_${domain.replace(/\./g, "%3A")}`;

  // 构建完整的标准格式URL
  const standardUrl = `vless://${uuid}@${domain}:${port}?${params.join(
    "&"
  )}#${encodeURIComponent(hashPart)}`;

  console.log(`生成标准格式ProxyIP节点: ${standardUrl.substring(0, 150)}...`);

  return standardUrl;
}

// 创建用户默认源节点配置 - 简化版本，只生成NAT64节点
async function createDefaultSourceNodes(userId, userUuid, env, hostName) {
  try {
    // 使用实际的Pages域名，如果没有提供则使用默认值
    const actualDomain = hostName || "your-worker.workers.dev";

    // 使用新的简化函数生成NAT64源节点
    const nat64Node = generateSimpleNAT64Node(userUuid, actualDomain);

    // 创建配置对象用于存储
    const nat64Config = {
      uuid: userUuid,
      domain: actualDomain,
    };

    // 保存到数据库并自动添加到节点池（包含 NAT64 + 可选 ProxyIP）
    const statements = [
      // 保存源节点配置
      env.DB.prepare(
        `
                INSERT INTO source_node_configs 
                (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `
      ).bind(
        userId,
        "系统默认NAT64源节点",
        "nat64",
        JSON.stringify(nat64Config),
        nat64Node,
        true,
        true
      ),
    ];

    // 同时添加到节点池
    const nat64Hash = generateSimpleHash(nat64Node);

    if (nat64Hash) {
      statements.push(
        env.DB.prepare(
          `
                    INSERT OR IGNORE INTO node_pool 
                    (user_id, source_id, node_url, node_hash, status) 
                    VALUES (?, ?, ?, ?, 'active')
                `
        ).bind(userId, null, nat64Node, nat64Hash)
      );
    }

    // 生成 ProxyIP 节点 - 使用新的生成函数，完全基于 BPB 标准
    const proxyIPConfig = {
      uuid: userUuid,
      domain: actualDomain,
      proxyIPs: [DEFAULT_PROXY_IP], // BPB 默认 ProxyIP 地址，在文件顶部配置
      port: 443,
      fingerprint: "randomized", // BPB 默认指纹
      alpn: "http/1.1", // BPB 默认 ALPN
    };

    const proxyIPNode = generateProxyIPSourceNode(proxyIPConfig);
    const proxyIPHash = generateSimpleHash(proxyIPNode);

    // 保存 ProxyIP 源节点配置到数据库
    statements.push(
      env.DB.prepare(
        `
                  INSERT INTO source_node_configs 
                  (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)
              `
      ).bind(
        userId,
        "系统默认ProxyIP源节点",
        "proxyip",
        JSON.stringify(proxyIPConfig),
        proxyIPNode,
        true,
        true
      )
    );

    // 保存 ProxyIP 节点到节点池
    if (proxyIPHash) {
      statements.push(
        env.DB.prepare(
          `
                    INSERT OR IGNORE INTO node_pool 
                    (user_id, source_id, node_url, node_hash, status) 
                    VALUES (?, ?, ?, ?, 'active')
                `
        ).bind(userId, null, proxyIPNode, proxyIPHash)
      );
    }

    await env.DB.batch(statements);

    console.log(`为用户 ${userId} 创建了系统默认NAT64源节点配置并添加到节点池`);
    console.log(
      `为用户 ${userId} 创建了系统默认ProxyIP源节点配置并添加到节点池`
    );
    console.log(`生成的NAT64节点: ${nat64Node}`);
    console.log(`生成的ProxyIP节点: ${proxyIPNode}`);
    return true;
  } catch (e) {
    console.error("创建默认源节点配置失败:", e);
    return false;
  }
}

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
  } catch (e) {
    return null;
  }
}

function safeBase64Decode(str) {
  try {
    return decodeURIComponent(
      escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))
    );
  } catch (e) {
    return null;
  }
}

// 密码哈希函数
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 用户会话验证函数
async function getUserBySession(request, env) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader || !cookieHeader.includes("session_id=")) {
    return null;
  }

  try {
    const sessionId = cookieHeader.match(/session_id=([^;]+)/)[1];
    const userId = await env.subscription.get(`session:${sessionId}`);
    if (!userId) return null;

    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(parseInt(userId))
      .first();
    return user || null;
  } catch (e) {
    console.error("Session validation error:", e);
    return null;
  }
}

// VLESS URL解析函数
function parseVlessUrl(url) {
  try {
    if (!url.startsWith("vless://")) {
      return null;
    }

    const urlObj = new URL(url);
    const result = {
      protocol: "vless",
      uuid: urlObj.username,
      host: urlObj.hostname,
      port: urlObj.port || "443",
      params: {},
      hash: urlObj.hash ? decodeURIComponent(urlObj.hash.substring(1)) : "",
    };

    // 解析所有参数并解码
    for (const [key, value] of urlObj.searchParams) {
      result.params[key] = decodeURIComponent(value);
    }

    return result;
  } catch (e) {
    console.log(`VLESS URL解析失败: ${e.message}`);
    return null;
  }
}

// URL标准化函数 - 按照v2rayN标准顺序重新构建
function normalizeVlessUrl(url) {
  const parsed = parseVlessUrl(url);
  if (!parsed) {
    return url; // 如果解析失败，返回原始URL
  }

  // v2rayN标准参数顺序
  const paramOrder = [
    "encryption",
    "security",
    "sni",
    "alpn",
    "fp",
    "type",
    "host",
    "path",
  ];

  // 构建标准化URL
  let normalizedUrl = `vless://${parsed.uuid}@${parsed.host}:${parsed.port}?`;

  const params = [];
  for (const paramName of paramOrder) {
    if (parsed.params[paramName]) {
      params.push(`${paramName}=${parsed.params[paramName]}`);
    }
  }

  // 添加其他未在标准顺序中的参数
  for (const [key, value] of Object.entries(parsed.params)) {
    if (!paramOrder.includes(key)) {
      params.push(`${key}=${value}`);
    }
  }

  normalizedUrl += params.join("&");

  if (parsed.hash) {
    normalizedUrl += `#${parsed.hash}`;
  }

  return normalizedUrl;
}

// 智能URL匹配函数 - 解决ProxyIP和NAT64节点的编码差异和参数顺序问题
async function findNodeByUrl(env, userId, nodeUrl) {
  const trimmedUrl = nodeUrl.trim();

  // 1. 首先尝试原始URL直接匹配
  let node = await env.DB.prepare(
    "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
  )
    .bind(userId, trimmedUrl)
    .first();

  if (node) {
    console.log(`原始URL直接匹配成功: ${trimmedUrl.substring(0, 100)}...`);
    return node;
  }

  // 2. 尝试标准化匹配 - 这是关键的新功能
  try {
    const normalizedInput = normalizeVlessUrl(trimmedUrl);
    console.log(`输入URL标准化: ${normalizedInput.substring(0, 150)}...`);

    // 获取用户的所有节点进行标准化比较
    const { results: allNodes } = await env.DB.prepare(
      "SELECT id, node_url FROM node_pool WHERE user_id = ?"
    )
      .bind(userId)
      .all();

    for (const dbNode of allNodes || []) {
      const normalizedDb = normalizeVlessUrl(dbNode.node_url);
      if (normalizedInput === normalizedDb) {
        console.log(`标准化匹配成功! 数据库节点ID: ${dbNode.id}`);
        console.log(`数据库URL标准化: ${normalizedDb.substring(0, 150)}...`);
        return { id: dbNode.id };
      }
    }

    console.log(`标准化匹配失败，检查了 ${allNodes?.length || 0} 个节点`);
  } catch (e) {
    console.log(`标准化匹配过程出错: ${e.message}`);
  }

  // 3. 尝试解码后的URL匹配（向后兼容）
  try {
    const decodedUrl = decodeURIComponent(trimmedUrl);
    if (decodedUrl !== trimmedUrl) {
      console.log(`尝试解码后的URL匹配: ${decodedUrl.substring(0, 100)}...`);
      node = await env.DB.prepare(
        "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
      )
        .bind(userId, decodedUrl)
        .first();

      if (node) {
        console.log(`解码URL匹配成功`);
        return node;
      }
    }
  } catch (e) {
    console.log(`URL解码失败: ${e.message}`);
  }

  // 4. 增强调试：检查节点是否存在于数据库中（不限用户）
  if (!node) {
    console.log(`调试：检查节点是否存在于任何用户的数据库中...`);
    const anyUserNode = await env.DB.prepare(
      "SELECT id, user_id FROM node_pool WHERE node_url = ? LIMIT 1"
    )
      .bind(trimmedUrl)
      .first();

    if (anyUserNode) {
      console.log(
        `调试：节点存在但属于用户 ${anyUserNode.user_id}，当前用户 ${userId}`
      );
    } else {
      console.log(`调试：节点在整个数据库中都不存在`);

      // 简化调试：只显示用户节点总数，避免复杂的LIKE查询导致SQL错误
      const nodeCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM node_pool WHERE user_id = ?"
      )
        .bind(userId)
        .first();

      console.log(`调试：用户共有 ${nodeCount?.count || 0} 个节点`);
    }
  }

  console.log(`所有URL匹配方式都失败: ${trimmedUrl.substring(0, 100)}...`);
  return null;
}

// 修复后的哈希函数 - 解决hash冲突问题
function generateSimpleHash(str) {
  if (!str || typeof str !== "string") return null;

  // 使用URL本身的特征生成更稳定的hash
  let hash = 0;

  // 第一层hash：基于字符串内容
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer

    // 添加位置权重，减少冲突
    hash = hash ^ (char << i % 16);
    hash = hash & hash;
  }

  // 第二层hash：基于内容特征
  const contentHash = str.split("").reduce((acc, char, index) => {
    return acc + char.charCodeAt(0) * (index + 1);
  }, 0);

  // 提取URL的关键部分作为唯一标识
  const urlParts = str.match(/@([^:]+):(\d+)/);
  const serverInfo = urlParts ? `${urlParts[1]}_${urlParts[2]}` : "manual";

  // 组合多个hash值和URL特征
  const finalHash = Math.abs(hash ^ contentHash);

  // 使用更强的唯一性标识
  return `node_${finalHash.toString(36)}_${str.length}_${serverInfo}_${
    Date.now() % 1000000
  }`;
}

// 刷新所有订阅源
async function fetchAllSourcesAndRefresh(userId, env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM subscription_sources WHERE user_id = ?"
  )
    .bind(userId)
    .all();

  if (results && results.length > 0) {
    const refreshPromises = results.map((source) =>
      refreshSubscriptionSource(source, env)
    );
    await Promise.all(refreshPromises);
  }
}

// 刷新单个订阅源
async function refreshSubscriptionSource(source, env) {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      "UPDATE subscription_sources SET fetch_status = 'fetching', last_fetch_at = ? WHERE id = ?"
    )
      .bind(now, source.id)
      .run();

    const response = await fetch(source.source_url, {
      headers: { "User-Agent": "Clash/2023.08.17" },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);

    const content = await response.text();
    const decodedContent = safeBase64Decode(content) || content;
    const nodeLinks = decodedContent
      .split(/[\n\r]+/)
      .filter((link) => link.trim() !== "");

    if (nodeLinks.length === 0) {
      await env.DB.prepare(
        "UPDATE subscription_sources SET fetch_status = 'success', node_count = 0, updated_at = ? WHERE id = ?"
      )
        .bind(now, source.id)
        .run();
      return;
    }

    await env.DB.prepare(
      "DELETE FROM node_pool WHERE user_id = ? AND source_id = ?"
    )
      .bind(source.user_id, source.id)
      .run();

    const statements = [];
    for (const link of nodeLinks) {
      const hash = generateSimpleHash(link);
      if (hash) {
        statements.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO node_pool (user_id, source_id, node_url, node_hash) VALUES (?, ?, ?, ?)"
          ).bind(source.user_id, source.id, link, hash)
        );
      }
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    await env.DB.prepare(
      "UPDATE subscription_sources SET fetch_status = 'success', node_count = ?, updated_at = ? WHERE id = ?"
    )
      .bind(statements.length, now, source.id)
      .run();
  } catch (e) {
    console.error(`Failed to refresh source ${source.id}:`, e.message);
    await env.DB.prepare(
      "UPDATE subscription_sources SET fetch_status = 'failed', updated_at = ? WHERE id = ?"
    )
      .bind(now, source.id)
      .run();
  }
}

// 节点链接解析函数
function parseNodeLinkForConfig(url) {
  try {
    const urlObject = new URL(url);
    if (url.startsWith("vless://")) {
      let uuid = urlObject.username;
      if (uuid.includes(":")) uuid = uuid.split(":")[1];
      const config = {
        name: urlObject.hash
          ? decodeURIComponent(urlObject.hash.substring(1))
          : `vless-${urlObject.hostname}`,
        type: "vless",
        server: urlObject.hostname,
        port: parseInt(urlObject.port, 10),
        uuid: uuid,
        tls:
          urlObject.searchParams.get("security") === "tls" ||
          urlObject.port === "443",
        "client-fingerprint": "chrome",
        servername: urlObject.searchParams.get("sni") || urlObject.hostname,
        network: urlObject.searchParams.get("type") || "tcp",
      };
      if (config.network === "ws")
        config["ws-opts"] = {
          path: urlObject.searchParams.get("path") || "/",
          headers: {
            Host: urlObject.searchParams.get("host") || urlObject.hostname,
          },
        };
      return config;
    } else if (url.startsWith("vmess://")) {
      const data = url.substring("vmess://".length);
      const decodedStr = safeBase64Decode(data);
      const config = JSON.parse(decodedStr);
      return {
        name: config.ps || `vmess-${config.add}`,
        type: "vmess",
        server: config.add,
        port: parseInt(config.port, 10),
        uuid: config.id,
        alterId: parseInt(config.aid || "0", 10),
        cipher: config.scy || "auto",
        tls: config.tls === "tls",
        "client-fingerprint": "chrome",
        servername: config.sni || config.add,
        network: config.net || "tcp",
        "ws-opts":
          config.net === "ws"
            ? {
                path: config.path || "/",
                headers: { Host: config.host || config.add },
              }
            : undefined,
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// =================================================================================
// 主要的 Worker 导出
// =================================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 检查是否为 WebSocket 升级请求（VLESS 代理）
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader === "websocket") {
      return await handleVlessWebSocket(request, env);
    }

    // 数据库初始化路由 - 创建源节点配置表
    if (url.pathname === "/api/init-db" && request.method === "POST") {
      try {
        // 创建源节点配置表
        await env.DB.prepare(
          `
                    CREATE TABLE IF NOT EXISTS source_node_configs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        config_name TEXT NOT NULL,
                        node_type TEXT NOT NULL CHECK (node_type IN ('nat64', 'proxyip')),
                        config_data TEXT NOT NULL,
                        generated_node TEXT NOT NULL,
                        is_default BOOLEAN DEFAULT FALSE,
                        enabled BOOLEAN DEFAULT TRUE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                    )
                `
        ).run();

        // 创建索引
        await env.DB.prepare(
          `
                    CREATE INDEX IF NOT EXISTS idx_source_node_configs_user_id ON source_node_configs(user_id)
                `
        ).run();

        await env.DB.prepare(
          `
                    CREATE INDEX IF NOT EXISTS idx_source_node_configs_type ON source_node_configs(node_type)
                `
        ).run();

        await env.DB.prepare(
          `
                    CREATE INDEX IF NOT EXISTS idx_source_node_configs_default ON source_node_configs(is_default)
                `
        ).run();

        // 检查是否需要为users表添加user_uuid字段
        try {
          const userTableInfo = await env.DB.prepare(
            "PRAGMA table_info(users)"
          ).all();
          const hasUserUuid = userTableInfo.results.some(
            (col) => col.name === "user_uuid"
          );

          if (!hasUserUuid) {
            await env.DB.prepare(
              "ALTER TABLE users ADD COLUMN user_uuid TEXT UNIQUE"
            ).run();
            await env.DB.prepare(
              "CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(user_uuid)"
            ).run();
            console.log("已为users表添加user_uuid字段");
          }
        } catch (e) {
          console.log("用户表结构检查/更新失败:", e.message);
        }

        return new Response(
          JSON.stringify({
            message: "数据库初始化成功",
            tables_created: ["source_node_configs"],
            indexes_created: [
              "idx_source_node_configs_user_id",
              "idx_source_node_configs_type",
              "idx_source_node_configs_default",
            ],
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("数据库初始化失败:", e);
        return new Response(
          JSON.stringify({
            error: `数据库初始化失败: ${e.message}`,
            stack: e.stack,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 调试路由 - 检查数据库连接和表结构
    if (url.pathname === "/api/debug" && request.method === "GET") {
      try {
        const dbCheck = env.DB ? "DB绑定正常" : "DB未绑定";
        const kvCheck = env.subscription ? "KV绑定正常" : "KV未绑定";

        let tableCheck = "未知";
        let usersTableStructure = "未知";

        if (env.DB) {
          try {
            // 检查users表是否存在
            const result = await env.DB.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
            ).first();
            tableCheck = result ? "users表存在" : "users表不存在";

            if (result) {
              // 检查users表结构
              const structure = await env.DB.prepare(
                "PRAGMA table_info(users)"
              ).all();
              usersTableStructure = structure.results
                .map((col) => `${col.name}(${col.type})`)
                .join(", ");
            }
          } catch (e) {
            tableCheck = `表检查失败: ${e.message}`;
          }
        }

        return new Response(
          JSON.stringify({
            database: dbCheck,
            kv: kvCheck,
            table: tableCheck,
            users_table_structure: usersTableStructure,
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: `调试失败: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 用户认证路由 =========================================================

    // 路由: 用户注册 (POST /api/register)
    if (url.pathname === "/api/register" && request.method === "POST") {
      try {
        const { username, password } = await request.json();
        console.log("注册请求:", {
          username,
          passwordLength: password?.length,
        });

        if (!username || !password) {
          return new Response(
            JSON.stringify({ error: "用户名和密码不能为空" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        console.log("检查用户是否存在...");
        const existingUser = await env.DB.prepare(
          "SELECT id FROM users WHERE username = ?"
        )
          .bind(username)
          .first();
        console.log("现有用户查询结果:", existingUser);

        if (existingUser) {
          return new Response(JSON.stringify({ error: "用户名已存在" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        console.log("开始创建用户...");
        const hashedPassword = await hashPassword(password);
        console.log("密码哈希完成");

        // 生成用户UUID
        const userUuid = crypto.randomUUID();
        console.log("生成用户UUID:", userUuid);

        // 创建用户（包含UUID）
        const insertResult = await env.DB.prepare(
          "INSERT INTO users (username, hashed_password, user_uuid) VALUES (?, ?, ?)"
        )
          .bind(username, hashedPassword, userUuid)
          .run();
        console.log("用户创建成功");

        // 获取新创建的用户ID
        const newUserId = insertResult.meta.last_row_id;
        console.log("新用户ID:", newUserId);

        // 创建默认源节点配置
        if (newUserId) {
          console.log("开始创建默认源节点配置...");
          // 获取当前请求的域名作为默认域名
          const currentHostName =
            request.headers.get("Host") || "your-worker.workers.dev";
          const defaultNodesCreated = await createDefaultSourceNodes(
            newUserId,
            userUuid,
            env,
            currentHostName
          );
          if (defaultNodesCreated) {
            console.log("默认源节点配置创建成功");
          } else {
            console.log("默认源节点配置创建失败，但用户注册成功");
          }
        }

        return new Response(JSON.stringify({ message: "注册成功" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("注册失败详细错误:", e);
        return new Response(
          JSON.stringify({
            error: "注册失败",
            details: e.message,
            stack: e.stack,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 用户登录 (POST /api/login)
    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const { username, password } = await request.json();
        console.log("登录请求:", {
          username,
          passwordLength: password?.length,
        });

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ?"
        )
          .bind(username)
          .first();
        console.log("用户查询结果:", user ? "找到用户" : "用户不存在");

        if (!user || (await hashPassword(password)) !== user.hashed_password) {
          return new Response(JSON.stringify({ error: "用户名或密码错误" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sessionId = crypto.randomUUID();
        console.log("创建会话:", sessionId);

        await env.subscription.put(`session:${sessionId}`, user.id.toString(), {
          expirationTtl: 86400 * 7,
        });

        const response = new Response(
          JSON.stringify({ message: "登录成功", username: user.username }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
        response.headers.set(
          "Set-Cookie",
          `session_id=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${
            86400 * 7
          }; Path=/`
        );
        return response;
      } catch (e) {
        console.error("登录失败详细错误:", e);
        return new Response(
          JSON.stringify({
            error: "登录失败",
            details: e.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 用户登出 (POST /api/logout)
    if (url.pathname === "/api/logout" && request.method === "POST") {
      const cookieHeader = request.headers.get("Cookie");
      if (cookieHeader && cookieHeader.includes("session_id=")) {
        const sessionId = cookieHeader.match(/session_id=([^;]+)/)[1];
        await env.subscription.delete(`session:${sessionId}`);
      }
      const response = new Response(JSON.stringify({ message: "登出成功" }));
      response.headers.set(
        "Set-Cookie",
        "session_id=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/"
      );
      return response;
    }

    // 路由: 检查登录状态 (GET /api/status)
    if (url.pathname === "/api/status" && request.method === "GET") {
      const user = await getUserBySession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const sub = await env.DB.prepare(
        "SELECT uuid FROM subscriptions WHERE user_id = ?"
      )
        .bind(user.id)
        .first();
      return new Response(
        JSON.stringify({
          authenticated: true,
          username: user.username,
          subscriptionUuid: sub ? sub.uuid : null,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --- NEW V2.0: Tag-Centric Management APIs ---

    // =================================================================
    // START: DEFINITIVE FIX for GET /api/tags
    // =================================================================
    if (url.pathname === "/api/tags" && request.method === "GET") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        // A much simpler, more robust query. We get the main tag info first.
        const { results: tags } = await env.DB.prepare(
          `SELECT id, tag_name, description, tag_uuid, created_at FROM tags WHERE user_id = ? ORDER BY created_at DESC`
        )
          .bind(user.id)
          .all();

        if (!tags || tags.length === 0) {
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Now, get node counts for all tags in a separate, efficient query.
        const tagIds = tags.map((t) => t.id);
        const placeholders = tagIds.map(() => "?").join(",");

        const { results: counts } = await env.DB.prepare(
          `SELECT tag_id, 
                            COUNT(node_id) as node_count, 
                            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count 
                     FROM node_tag_map 
                     LEFT JOIN node_pool ON node_pool.id = node_tag_map.node_id
                     WHERE tag_id IN (${placeholders})
                     GROUP BY tag_id`
        )
          .bind(...tagIds)
          .all();

        // Create a map for easy lookup
        const countMap = new Map(
          counts.map((c) => [
            c.tag_id,
            { node_count: c.node_count, active_count: c.active_count || 0 },
          ])
        );

        // Combine the data
        const resultsWithCounts = tags.map((tag) => ({
          ...tag,
          node_count: countMap.get(tag.id)?.node_count || 0,
          active_count: countMap.get(tag.id)?.active_count || 0,
        }));

        return new Response(JSON.stringify(resultsWithCounts), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("获取Tag列表失败:", e);
        return new Response(
          JSON.stringify({
            error: "获取Tag列表时发生数据库错误",
            details: e.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
    // =================================================================
    // END: DEFINITIVE FIX
    // =================================================================

    // 路由: 批量删除Tag (POST /api/tags/batch-delete) - 受保护
    if (
      url.pathname === "/api/tags/batch-delete" &&
      request.method === "POST"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { tag_ids } = await request.json();

        if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
          return new Response(JSON.stringify({ error: "Tag ID列表不能为空" }), {
            status: 400,
          });
        }

        // 验证Tag所有权
        const { results: userTags } = await env.DB.prepare(
          `SELECT id, tag_name FROM tags WHERE user_id = ? AND id IN (${tag_ids
            .map(() => "?")
            .join(",")})`
        )
          .bind(user.id, ...tag_ids)
          .all();

        if (userTags.length !== tag_ids.length) {
          return new Response(
            JSON.stringify({ error: "部分Tag不存在或无权限" }),
            { status: 403 }
          );
        }

        // 批量删除Tag和相关映射关系
        const statements = [];

        // 1. 删除node_tag_map中的映射关系
        for (const tagId of tag_ids) {
          statements.push(
            env.DB.prepare("DELETE FROM node_tag_map WHERE tag_id = ?").bind(
              tagId
            )
          );
        }

        // 2. 删除tags表中的记录
        for (const tagId of tag_ids) {
          statements.push(
            env.DB.prepare(
              "DELETE FROM tags WHERE user_id = ? AND id = ?"
            ).bind(user.id, tagId)
          );
        }

        await env.DB.batch(statements);

        const tagNames = userTags.map((tag) => tag.tag_name).join("、");
        return new Response(
          JSON.stringify({
            message: `成功删除 ${tag_ids.length} 个Tag: ${tagNames}`,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("批量删除Tag失败:", e);
        return new Response(
          JSON.stringify({
            error: `删除失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 创建新Tag (POST /api/tags) - 受保护
    if (url.pathname === "/api/tags" && request.method === "POST") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { tag_name, description } = await request.json();
        if (!tag_name || tag_name.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Tag名称不能为空" }), {
            status: 400,
          });
        }

        const existing = await env.DB.prepare(
          "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
        )
          .bind(user.id, tag_name.trim())
          .first();

        if (existing) {
          return new Response(JSON.stringify({ error: "Tag名称已存在" }), {
            status: 400,
          });
        }

        const tagUuid = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO tags (user_id, tag_name, description, tag_uuid) VALUES (?, ?, ?, ?)"
        )
          .bind(user.id, tag_name.trim(), description || "", tagUuid)
          .run();

        return new Response(
          JSON.stringify({
            message: "Tag创建成功",
            tag_name: tag_name.trim(),
            uuid: tagUuid,
          }),
          { status: 201 }
        );
      } catch (e) {
        console.error("创建Tag失败:", e);
        return new Response(
          JSON.stringify({ error: `创建失败: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 将节点添加到Tag (POST /api/tags/add-nodes) - 受保护
    if (url.pathname === "/api/tags/add-nodes" && request.method === "POST") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { tag_name, nodes } = await request.json();
        if (!tag_name || !nodes || !Array.isArray(nodes)) {
          return new Response(JSON.stringify({ error: "参数错误" }), {
            status: 400,
          });
        }

        console.log(`开始处理Tag: ${tag_name}, 节点数量: ${nodes.length}`);

        let tag = await env.DB.prepare(
          "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
        )
          .bind(user.id, tag_name)
          .first();

        if (!tag) {
          const tagUuid = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO tags (user_id, tag_name, tag_uuid) VALUES (?, ?, ?)"
          )
            .bind(user.id, tag_name, tagUuid)
            .run();

          tag = await env.DB.prepare(
            "SELECT id FROM tags WHERE user_id = ? AND tag_name = ?"
          )
            .bind(user.id, tag_name)
            .first();
          console.log(`创建新Tag: ${tag_name}, ID: ${tag.id}`);
        }

        let successCount = 0;
        let existingCount = 0;
        let failedCount = 0;
        const nodeIds = [];

        // 逐个处理节点，提供详细的错误信息
        for (const nodeUrl of nodes) {
          if (!nodeUrl || typeof nodeUrl !== "string") {
            failedCount++;
            continue;
          }

          const trimmedUrl = nodeUrl.trim();
          console.log(`处理节点: ${trimmedUrl.substring(0, 50)}...`);

          // 使用统一的URL匹配函数检查节点是否已存在
          const existingNode = await findNodeByUrl(env, user.id, trimmedUrl);

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
              )
                .bind(user.id, null, trimmedUrl, hash)
                .run();

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
              if (insertError.message.includes("UNIQUE constraint failed")) {
                // Hash冲突，尝试查找现有节点
                const conflictNode = await env.DB.prepare(
                  "SELECT id FROM node_pool WHERE user_id = ? AND node_hash = ?"
                )
                  .bind(user.id, hash)
                  .first();

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

        console.log(
          `节点处理完成: 成功${successCount}, 已存在${existingCount}, 失败${failedCount}`
        );

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
        return new Response(
          JSON.stringify({
            message: `成功将 ${totalProcessed} 个节点添加到Tag '${tag_name}'`,
            added_count: totalProcessed,
            details: {
              new_nodes: successCount,
              existing_nodes: existingCount,
              failed_nodes: failedCount,
              total_processed: nodes.length,
            },
          }),
          { status: 200 }
        );
      } catch (e) {
        console.error("添加节点到Tag失败:", e);
        return new Response(
          JSON.stringify({
            error: `操作失败: ${e.message}`,
            stack: e.stack,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 更新节点状态 (POST /api/nodes/update-status) - 受保护
    if (
      url.pathname === "/api/nodes/update-status" &&
      request.method === "POST"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { nodes, mark_others_failed } = await request.json();
        if (!nodes || !Array.isArray(nodes)) {
          return new Response(JSON.stringify({ error: "节点列表不能为空" }), {
            status: 400,
          });
        }

        const activeHashes = [];
        for (const nodeUrl of nodes) {
          if (nodeUrl && typeof nodeUrl === "string") {
            const hash = generateSimpleHash(nodeUrl);
            if (hash) {
              activeHashes.push(hash);
            }
          }
        }

        if (activeHashes.length === 0) {
          return new Response(JSON.stringify({ error: "没有有效的节点" }), {
            status: 400,
          });
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
          const hashPlaceholders = activeHashes.map(() => "?").join(",");
          statements.push(
            env.DB.prepare(
              `UPDATE node_pool SET status = 'failed', last_test_at = ? WHERE user_id = ? AND node_hash NOT IN (${hashPlaceholders})`
            ).bind(new Date().toISOString(), user.id, ...activeHashes)
          );
        }

        await env.DB.batch(statements);

        return new Response(
          JSON.stringify({
            message: `成功更新 ${activeHashes.length} 个节点状态为可用`,
            updated_count: activeHashes.length,
          }),
          { status: 200 }
        );
      } catch (e) {
        console.error("更新节点状态失败:", e);
        return new Response(
          JSON.stringify({ error: `更新失败: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 订阅源管理路由 =========================================================

    // 路由: 获取订阅源列表 (GET /api/subscription-sources) - 受保护
    if (
      url.pathname === "/api/subscription-sources" &&
      request.method === "GET"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { results } = await env.DB.prepare(
          "SELECT id, source_name, source_url, fetch_status, node_count, last_fetch_at FROM subscription_sources WHERE user_id = ? ORDER BY created_at DESC"
        )
          .bind(user.id)
          .all();

        return new Response(JSON.stringify(results || []), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("获取订阅源失败:", e);
        if (e.message.includes("no such table")) {
          return new Response(
            JSON.stringify({
              error: "数据库表不存在，请确保已创建subscription_sources表",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response(
          JSON.stringify({ error: `数据库错误: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 添加订阅源 (POST /api/subscription-sources) - 受保护
    if (
      url.pathname === "/api/subscription-sources" &&
      request.method === "POST"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { source_name, source_url } = await request.json();
        if (!source_name || !source_url || !source_url.startsWith("http")) {
          return new Response(
            JSON.stringify({ error: "名称和有效的URL不能为空" }),
            { status: 400 }
          );
        }

        await env.DB.prepare(
          "INSERT INTO subscription_sources (user_id, source_name, source_url) VALUES (?, ?, ?)"
        )
          .bind(user.id, source_name, source_url)
          .run();

        return new Response(JSON.stringify({ message: "订阅源添加成功！" }), {
          status: 201,
        });
      } catch (e) {
        console.error("添加订阅源失败:", e);
        if (e.message.includes("no such table")) {
          return new Response(
            JSON.stringify({
              error: "数据库表不存在，请确保已创建subscription_sources表",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response(
          JSON.stringify({ error: `数据库错误: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 删除订阅源 (DELETE /api/subscription-sources/:id) - 受保护
    if (
      url.pathname.startsWith("/api/subscription-sources/") &&
      request.method === "DELETE" &&
      !url.pathname.includes("/refresh")
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });

        const sourceId = url.pathname.split("/")[3];
        if (!sourceId || isNaN(parseInt(sourceId))) {
          return new Response(JSON.stringify({ error: "无效的订阅源ID" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 验证订阅源所有权
        const source = await env.DB.prepare(
          "SELECT id, source_name FROM subscription_sources WHERE user_id = ? AND id = ?"
        )
          .bind(user.id, parseInt(sourceId))
          .first();

        if (!source) {
          return new Response(
            JSON.stringify({ error: "订阅源不存在或无权限删除" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // 按正确顺序删除：先删除子表（node_pool），再删除父表（subscription_sources）
        // 这样可以避免外键约束错误
        const deleteResult = await env.DB.batch([
          // 1. 先删除node_tag_map中的映射关系
          env.DB.prepare(
            `
                        DELETE FROM node_tag_map 
                        WHERE node_id IN (
                            SELECT id FROM node_pool 
                            WHERE user_id = ? AND source_id = ?
                        )
                    `
          ).bind(user.id, parseInt(sourceId)),
          // 2. 再删除node_pool中的节点
          env.DB.prepare(
            "DELETE FROM node_pool WHERE user_id = ? AND source_id = ?"
          ).bind(user.id, parseInt(sourceId)),
          // 3. 最后删除subscription_sources中的订阅源
          env.DB.prepare(
            "DELETE FROM subscription_sources WHERE user_id = ? AND id = ?"
          ).bind(user.id, parseInt(sourceId)),
        ]);

        return new Response(
          JSON.stringify({
            message: `订阅源 "${source.source_name}" 及相关节点已删除`,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("删除订阅源失败:", e);
        return new Response(
          JSON.stringify({
            error: `删除失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 刷新订阅源 (POST /api/subscription-sources/:id/refresh) - 受保护
    if (url.pathname.includes("/refresh") && request.method === "POST") {
      const user = await getUserBySession(request, env);
      if (!user)
        return new Response(JSON.stringify({ error: "未授权" }), {
          status: 401,
        });

      const sourceId = url.pathname.split("/")[3];
      const source = await env.DB.prepare(
        "SELECT * FROM subscription_sources WHERE id = ? AND user_id = ?"
      )
        .bind(sourceId, user.id)
        .first();

      if (!source)
        return new Response(JSON.stringify({ error: "订阅源不存在" }), {
          status: 404,
        });

      ctx.waitUntil(refreshSubscriptionSource(source, env));

      return new Response(
        JSON.stringify({
          message: `已开始刷新 '${source.source_name}', 请稍后查看结果。`,
        })
      );
    }

    // 路由: 创建/更新订阅 (POST /api/create-sub) - 受保护
    if (url.pathname === "/api/create-sub" && request.method === "POST") {
      const user = await getUserBySession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: "未授权" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const { nodes } = await request.json();
      const encodedNodes = safeBase64Encode(nodes);
      const now = new Date().toISOString();
      let sub = await env.DB.prepare(
        "SELECT uuid FROM subscriptions WHERE user_id = ?"
      )
        .bind(user.id)
        .first();
      if (sub) {
        await env.DB.prepare(
          "UPDATE subscriptions SET node_data_base64 = ?, updated_at = ? WHERE user_id = ?"
        )
          .bind(encodedNodes, now, user.id)
          .run();
      } else {
        const newUuid = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO subscriptions (user_id, uuid, node_data_base64, updated_at) VALUES (?, ?, ?, ?)"
        )
          .bind(user.id, newUuid, encodedNodes, now)
          .run();
        sub = { uuid: newUuid };
      }
      return new Response(
        JSON.stringify({ subscriptionUrl: `${url.origin}/sub/${sub.uuid}` }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 路由: 节点批量操作 (POST /api/nodes/batch-operate) - 受保护
    if (
      url.pathname === "/api/nodes/batch-operate" &&
      request.method === "POST"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { tag_ids, nodes, action } = await request.json();

        // 验证参数
        if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
          return new Response(JSON.stringify({ error: "Tag ID列表不能为空" }), {
            status: 400,
          });
        }

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
          return new Response(JSON.stringify({ error: "节点列表不能为空" }), {
            status: 400,
          });
        }

        if (!action || !["add", "delete"].includes(action)) {
          return new Response(JSON.stringify({ error: "操作类型无效" }), {
            status: 400,
          });
        }

        // 验证Tag所有权
        const { results: userTags } = await env.DB.prepare(
          `SELECT id, tag_name FROM tags WHERE user_id = ? AND id IN (${tag_ids
            .map(() => "?")
            .join(",")})`
        )
          .bind(user.id, ...tag_ids)
          .all();

        if (userTags.length !== tag_ids.length) {
          return new Response(
            JSON.stringify({ error: "部分Tag不存在或无权限" }),
            { status: 403 }
          );
        }

        const results = [];
        const tagMap = new Map(userTags.map((tag) => [tag.id, tag.tag_name]));

        if (action === "add") {
          // 添加节点到Tag
          for (const tagId of tag_ids) {
            const tagName = tagMap.get(tagId);
            let addedCount = 0;
            let existingCount = 0;

            for (const nodeUrl of nodes) {
              const trimmedUrl = nodeUrl.trim();
              console.log(
                `添加操作：处理节点 ${trimmedUrl.substring(0, 50)}...`
              );

              // 先使用URL直接匹配检查节点是否已存在
              let node = await env.DB.prepare(
                "SELECT id FROM node_pool WHERE user_id = ? AND node_url = ?"
              )
                .bind(user.id, trimmedUrl)
                .first();

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
                  )
                    .bind(user.id, null, trimmedUrl, nodeHash)
                    .run();

                  if (insertResult.success && insertResult.meta.last_row_id) {
                    node = { id: insertResult.meta.last_row_id };
                    console.log(`成功创建节点: ${nodeHash}`);
                  } else {
                    console.error(`节点创建失败: ${nodeHash}`, insertResult);
                    continue; // 跳过这个节点
                  }
                } catch (insertError) {
                  if (
                    insertError.message.includes("UNIQUE constraint failed")
                  ) {
                    // Hash冲突，使用统一URL匹配函数查找现有节点
                    const conflictNode = await findNodeByUrl(
                      env,
                      user.id,
                      trimmedUrl
                    );

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
              )
                .bind(node.id, tagId)
                .first();

              if (!existing) {
                // 添加到Tag
                await env.DB.prepare(
                  "INSERT INTO node_tag_map (node_id, tag_id) VALUES (?, ?)"
                )
                  .bind(node.id, tagId)
                  .run();
                addedCount++;
              } else {
                existingCount++;
              }
            }

            if (addedCount > 0 && existingCount > 0) {
              results.push(
                `${tagName}: 添加了 ${addedCount} 个节点，${existingCount} 个已存在`
              );
            } else if (addedCount > 0) {
              results.push(`${tagName}: 添加了 ${addedCount} 个节点`);
            } else if (existingCount > 0) {
              results.push(`${tagName}: ${existingCount} 个节点已存在`);
            }
          }
        } else if (action === "delete") {
          // 从Tag删除节点
          for (const tagId of tag_ids) {
            const tagName = tagMap.get(tagId);
            let deletedCount = 0;
            let notInTagCount = 0;
            let nodeNotExistCount = 0;

            for (const nodeUrl of nodes) {
              const trimmedUrl = nodeUrl.trim();
              console.log(
                `删除操作：查找节点 ${trimmedUrl.substring(0, 50)}...`
              );

              // 使用统一的URL匹配函数查找节点（解决ProxyIP编码问题）
              const node = await findNodeByUrl(env, user.id, trimmedUrl);

              // 增强调试：检查节点是否存在于数据库中（不限用户）
              if (!node) {
                console.log(`调试：检查节点是否存在于任何用户的数据库中...`);
                const anyUserNode = await env.DB.prepare(
                  "SELECT id, user_id FROM node_pool WHERE node_url = ? LIMIT 1"
                )
                  .bind(trimmedUrl)
                  .first();

                if (anyUserNode) {
                  console.log(
                    `调试：节点存在但属于用户 ${anyUserNode.user_id}，当前用户 ${user.id}`
                  );
                } else {
                  console.log(`调试：节点在整个数据库中都不存在`);

                  // 简化调试：只显示用户节点总数，避免复杂的LIKE查询导致SQL错误
                  const nodeCount = await env.DB.prepare(
                    "SELECT COUNT(*) as count FROM node_pool WHERE user_id = ?"
                  )
                    .bind(user.id)
                    .first();

                  console.log(`调试：用户共有 ${nodeCount?.count || 0} 个节点`);
                }
              }

              if (node) {
                console.log(`找到节点，ID: ${node.id}`);

                // 先检查节点是否真的在Tag中（调试用）
                console.log(
                  `调试信息：节点ID=${
                    node.id
                  } (类型: ${typeof node.id}), TagID=${tagId} (类型: ${typeof tagId})`
                );

                const checkMapping = await env.DB.prepare(
                  "SELECT id, node_id, tag_id FROM node_tag_map WHERE node_id = ? AND tag_id = ?"
                )
                  .bind(node.id, tagId)
                  .first();
                console.log(
                  `删除前检查：节点 ${node.id} 在Tag ${tagId} 中的映射:`,
                  checkMapping ? "存在" : "不存在"
                );

                // 额外检查：查看这个节点在哪些Tag中
                const allMappings = await env.DB.prepare(
                  "SELECT tag_id FROM node_tag_map WHERE node_id = ?"
                )
                  .bind(node.id)
                  .all();
                console.log(
                  `节点 ${node.id} 的所有Tag映射:`,
                  allMappings.results.map((r) => r.tag_id)
                );

                // 直接尝试删除，根据删除结果统计
                const deleteResult = await env.DB.prepare(
                  "DELETE FROM node_tag_map WHERE node_id = ? AND tag_id = ?"
                )
                  .bind(node.id, tagId)
                  .run();

                const actualChanges =
                  deleteResult.meta?.changes || deleteResult.changes || 0;
                console.log(`删除结果详情:`, {
                  success: deleteResult.success,
                  changes: deleteResult.changes,
                  meta_changes: deleteResult.meta?.changes,
                  actual_changes: actualChanges,
                  meta: deleteResult.meta,
                });

                if (actualChanges > 0) {
                  deletedCount++;
                  console.log(
                    `✅ 成功从Tag删除节点 ${node.id}，changes: ${actualChanges}`
                  );
                } else {
                  notInTagCount++;
                  console.log(
                    `❌ 节点 ${node.id} 删除失败，changes: ${actualChanges}，可能不在Tag ${tagId} 中`
                  );
                }
              } else {
                nodeNotExistCount++;
                console.log(`未找到节点: ${trimmedUrl.substring(0, 50)}...`);
              }
            }

            console.log(
              `Tag ${tagName} 删除统计: 成功删除 ${deletedCount} 个，不在Tag中 ${notInTagCount} 个，节点不存在 ${nodeNotExistCount} 个`
            );

            // 简化提示逻辑：优先显示成功信息
            if (deletedCount === nodes.length) {
              // 所有节点都删除成功
              results.push(`${tagName}: 成功删除 ${deletedCount} 个节点`);
            } else if (deletedCount > 0) {
              // 部分节点删除成功
              const failureDetails = [];
              if (notInTagCount > 0)
                failureDetails.push(`${notInTagCount}个不在此Tag中`);
              if (nodeNotExistCount > 0)
                failureDetails.push(`${nodeNotExistCount}个节点不存在`);
              results.push(
                `${tagName}: 成功删除 ${deletedCount} 个节点，${failureDetails.join(
                  "，"
                )}`
              );
            } else {
              // 没有删除任何节点的情况
              if (notInTagCount > 0 && nodeNotExistCount > 0) {
                results.push(
                  `${tagName}: ${notInTagCount} 个节点不在此Tag中，${nodeNotExistCount} 个节点不存在`
                );
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

        const actionText = action === "add" ? "添加" : "删除";
        return new Response(
          JSON.stringify({
            message: `批量${actionText}操作完成！`,
            details: results,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("批量操作失败:", e);
        return new Response(
          JSON.stringify({
            error: `批量操作失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 源节点配置管理路由 =========================================================

    // 路由: 获取源节点配置列表 (GET /api/source-nodes) - 受保护
    if (url.pathname === "/api/source-nodes" && request.method === "GET") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { results } = await env.DB.prepare(
          `
                    SELECT id, config_name, node_type, config_data, generated_node, is_default, enabled, created_at 
                    FROM source_node_configs 
                    WHERE user_id = ? 
                    ORDER BY is_default DESC, created_at DESC
                `
        )
          .bind(user.id)
          .all();

        return new Response(JSON.stringify(results || []), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("获取源节点配置失败:", e);
        return new Response(
          JSON.stringify({
            error: `获取源节点配置失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 创建源节点配置 (POST /api/source-nodes) - 受保护
    if (url.pathname === "/api/source-nodes" && request.method === "POST") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { config_name, node_type, config_data } = await request.json();

        if (!config_name || !node_type || !config_data) {
          return new Response(
            JSON.stringify({ error: "配置名称、节点类型和配置数据不能为空" }),
            {
              status: 400,
            }
          );
        }

        if (!["nat64", "proxyip"].includes(node_type)) {
          return new Response(
            JSON.stringify({ error: "节点类型必须是 nat64 或 proxyip" }),
            {
              status: 400,
            }
          );
        }

        // 生成源节点
        let generatedNode;
        try {
          if (node_type === "nat64") {
            // 使用简化的NAT64生成函数
            generatedNode = generateSimpleNAT64Node(
              config_data.uuid,
              config_data.domain
            );
          } else if (node_type === "proxyip") {
            generatedNode = generateProxyIPSourceNode(config_data);
          }
        } catch (e) {
          return new Response(
            JSON.stringify({ error: `生成源节点失败: ${e.message}` }),
            {
              status: 400,
            }
          );
        }

        // 保存到数据库并添加到节点池
        const nodeHash = generateSimpleHash(generatedNode);
        const statements = [
          // 保存源节点配置
          env.DB.prepare(
            `
                        INSERT INTO source_node_configs 
                        (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `
          ).bind(
            user.id,
            config_name,
            node_type,
            JSON.stringify(config_data),
            generatedNode,
            false,
            true
          ),
        ];

        // 同时添加到节点池
        if (nodeHash) {
          statements.push(
            env.DB.prepare(
              `
                            INSERT OR IGNORE INTO node_pool 
                            (user_id, source_id, node_url, node_hash, status) 
                            VALUES (?, ?, ?, ?, 'active')
                        `
            ).bind(user.id, null, generatedNode, nodeHash)
          );
        }

        await env.DB.batch(statements);

        return new Response(
          JSON.stringify({
            message: "源节点配置创建成功",
            generated_node: generatedNode,
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("创建源节点配置失败:", e);
        return new Response(
          JSON.stringify({
            error: `创建源节点配置失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 生成源节点 (POST /api/generate-source-node) - 受保护
    if (
      url.pathname === "/api/generate-source-node" &&
      request.method === "POST"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const { node_type, config_data } = await request.json();

        if (!node_type || !config_data) {
          return new Response(
            JSON.stringify({ error: "节点类型和配置数据不能为空" }),
            {
              status: 400,
            }
          );
        }

        if (!["nat64", "proxyip"].includes(node_type)) {
          return new Response(
            JSON.stringify({ error: "节点类型必须是 nat64 或 proxyip" }),
            {
              status: 400,
            }
          );
        }

        // 生成源节点
        let generatedNode;
        try {
          if (node_type === "nat64") {
            // 使用简化的NAT64生成函数
            generatedNode = generateSimpleNAT64Node(
              config_data.uuid,
              config_data.domain
            );
          } else if (node_type === "proxyip") {
            generatedNode = generateProxyIPSourceNode(config_data);
          }
        } catch (e) {
          return new Response(
            JSON.stringify({ error: `生成源节点失败: ${e.message}` }),
            {
              status: 400,
            }
          );
        }

        return new Response(
          JSON.stringify({
            generated_node: generatedNode,
            node_type: node_type,
            config_data: config_data,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("生成源节点失败:", e);
        return new Response(
          JSON.stringify({
            error: `生成源节点失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 更新源节点配置 (PUT /api/source-nodes/:id) - 受保护
    if (
      url.pathname.startsWith("/api/source-nodes/") &&
      request.method === "PUT"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const configId = url.pathname.split("/")[3];
        if (!configId || isNaN(parseInt(configId))) {
          return new Response(JSON.stringify({ error: "无效的配置ID" }), {
            status: 400,
          });
        }

        const { config_name, config_data, enabled } = await request.json();

        // 验证配置所有权
        const existingConfig = await env.DB.prepare(
          "SELECT id, node_type, is_default FROM source_node_configs WHERE user_id = ? AND id = ?"
        )
          .bind(user.id, parseInt(configId))
          .first();

        if (!existingConfig) {
          return new Response(JSON.stringify({ error: "配置不存在或无权限" }), {
            status: 404,
          });
        }

        // 重新生成源节点
        let generatedNode;
        if (config_data) {
          try {
            if (existingConfig.node_type === "nat64") {
              // 使用简化的NAT64生成函数
              generatedNode = generateSimpleNAT64Node(
                config_data.uuid,
                config_data.domain
              );
            } else if (existingConfig.node_type === "proxyip") {
              generatedNode = generateProxyIPSourceNode(config_data);
            }
          } catch (e) {
            return new Response(
              JSON.stringify({ error: `重新生成源节点失败: ${e.message}` }),
              {
                status: 400,
              }
            );
          }
        }

        // 构建更新语句
        const updateFields = [];
        const updateValues = [];

        if (config_name !== undefined) {
          updateFields.push("config_name = ?");
          updateValues.push(config_name);
        }

        if (config_data !== undefined) {
          updateFields.push("config_data = ?");
          updateValues.push(JSON.stringify(config_data));
        }

        if (generatedNode !== undefined) {
          updateFields.push("generated_node = ?");
          updateValues.push(generatedNode);
        }

        if (enabled !== undefined) {
          updateFields.push("enabled = ?");
          updateValues.push(enabled);
        }

        if (updateFields.length === 0) {
          return new Response(JSON.stringify({ error: "没有要更新的字段" }), {
            status: 400,
          });
        }

        updateValues.push(user.id, parseInt(configId));

        await env.DB.prepare(
          `
                    UPDATE source_node_configs 
                    SET ${updateFields.join(
                      ", "
                    )}, updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ? AND id = ?
                `
        )
          .bind(...updateValues)
          .run();

        return new Response(
          JSON.stringify({
            message: "源节点配置更新成功",
            generated_node: generatedNode,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("更新源节点配置失败:", e);
        return new Response(
          JSON.stringify({
            error: `更新源节点配置失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 路由: 删除源节点配置 (DELETE /api/source-nodes/:id) - 受保护
    if (
      url.pathname.startsWith("/api/source-nodes/") &&
      request.method === "DELETE"
    ) {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

        const configId = url.pathname.split("/")[3];
        if (!configId || isNaN(parseInt(configId))) {
          return new Response(JSON.stringify({ error: "无效的配置ID" }), {
            status: 400,
          });
        }

        // 验证配置所有权和是否为默认配置
        const existingConfig = await env.DB.prepare(
          "SELECT id, config_name, is_default FROM source_node_configs WHERE user_id = ? AND id = ?"
        )
          .bind(user.id, parseInt(configId))
          .first();

        if (!existingConfig) {
          return new Response(JSON.stringify({ error: "配置不存在或无权限" }), {
            status: 404,
          });
        }

        if (existingConfig.is_default) {
          return new Response(JSON.stringify({ error: "不能删除默认配置" }), {
            status: 400,
          });
        }

        // 删除配置
        await env.DB.prepare(
          "DELETE FROM source_node_configs WHERE user_id = ? AND id = ?"
        )
          .bind(user.id, parseInt(configId))
          .run();

        return new Response(
          JSON.stringify({
            message: `源节点配置 "${existingConfig.config_name}" 已删除`,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        console.error("删除源节点配置失败:", e);
        return new Response(
          JSON.stringify({
            error: `删除源节点配置失败: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 节点池管理路由 =========================================================

    // 路由: 获取节点池列表 (GET /api/nodes) - 受保护
    if (url.pathname === "/api/nodes" && request.method === "GET") {
      try {
        const user = await getUserBySession(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
          });

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
        )
          .bind(user.id)
          .all();

        const nodesWithNames = results.map((node) => {
          const parsed = parseNodeLinkForConfig(node.node_url);
          const protocol = node.node_url.split("://")[0] || "unknown";
          return {
            ...node,
            node_name: parsed ? parsed.name : "无法解析的节点",
            protocol: protocol,
            server: parsed ? parsed.server : "unknown",
          };
        });

        return new Response(JSON.stringify(nodesWithNames || []), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("获取节点池失败:", e);
        if (e.message.includes("no such table")) {
          return new Response(
            JSON.stringify({
              error: "数据库表不存在，请确保已创建node_pool表",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response(
          JSON.stringify({ error: `数据库错误: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 核心服务路由 =========================================================

    // 路由: 提供订阅内容 (GET /sub/:uuid 或 /sub/tag/:tag_uuid)
    if (url.pathname.startsWith("/sub/")) {
      const pathParts = url.pathname.split("/");
      let nodeUrls = [];

      if (pathParts[2] === "tag" && pathParts[3]) {
        const tagUuid = pathParts[3];
        try {
          const { results } = await env.DB.prepare(
            `
                        SELECT np.node_url 
                        FROM tags t
                        JOIN node_tag_map ntm ON t.id = ntm.tag_id
                        JOIN node_pool np ON ntm.node_id = np.id
                        WHERE t.tag_uuid = ? AND np.status != 'failed'
                        ORDER BY np.created_at DESC
                    `
          )
            .bind(tagUuid)
            .all();

          if (!results || results.length === 0) {
            return new Response("Tag subscription not found or is empty", {
              status: 404,
            });
          }

          nodeUrls = results.map((r) => r.node_url);
        } catch (e) {
          console.error("Tag subscription error:", e);
          return new Response("Tag subscription error", { status: 500 });
        }
      } else {
        const subUuid = pathParts[2];
        const sub = await env.DB.prepare(
          "SELECT node_data_base64 FROM subscriptions WHERE uuid = ?"
        )
          .bind(subUuid)
          .first();
        if (!sub || !sub.node_data_base64) {
          return new Response("Subscription not found or is empty", {
            status: 404,
          });
        }
        const nodesString = safeBase64Decode(sub.node_data_base64);
        nodeUrls = nodesString.split("\n").filter(Boolean);
      }

      const formatType = url.searchParams.get("type") || "base64";

      if (formatType === "base64") {
        const encodedNodes = safeBase64Encode(nodeUrls.join("\n"));
        return new Response(encodedNodes, {
          headers: { "Content-Type": "text/plain;charset=utf-8" },
        });
      }

      if (formatType === "clash") {
        const proxies = nodeUrls.map(parseNodeLinkForConfig).filter(Boolean);
        if (proxies.length === 0) {
          return new Response("No valid nodes found for Clash format", {
            status: 404,
          });
        }
        const proxyNames = proxies.map((p) => p.name);
        let clashConfig = clashConfigTemplate
          .replace(
            "##PROXIES##",
            proxies.map((p) => `  - ${JSON.stringify(p)}`).join("\n")
          )
          .replace(
            /##PROXY_NAMES##/g,
            proxyNames.map((name) => `      - "${name}"`).join("\n")
          );
        return new Response(clashConfig, {
          headers: { "Content-Type": "text/yaml;charset=utf-8" },
        });
      }

      return new Response(`Unsupported format type: ${formatType}`, {
        status: 400,
      });
    }

    // 默认路由: 提供静态文件
    return env.ASSETS.fetch(request);
  },
};
