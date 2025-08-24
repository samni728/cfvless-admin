// =================================================================================
// 修复版 NAT64 VLESS Worker 脚本 - 解决重试机制不稳定问题
// UUID: 728add07-eda9-4447-bde4-3f76d8db020f
// 参考: cf-vless/_workernat64.js
// =================================================================================

import { connect } from "cloudflare:sockets";

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
let userID = "728add07-eda9-4447-bde4-3f76d8db020f";
const cn_hostnames = [""];

// 使用参考代码中的 CDNIP 配置
let CDNIP =
  "\u0077\u0077\u0077\u002e\u0076\u0069\u0073\u0061\u002e\u0063\u006f\u006d\u002e\u0073\u0067";

// 辅助函数
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

// Base64 解码函数
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

// VLESS 头部处理函数
async function processVlessHeader(vlessBuffer) {
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

  // 验证用户UUID
  if (slicedBufferString === userID) {
    isValidUser = true;
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

// NAT64 IPv6地址转换函数 - 严格按照原版逻辑
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

// 获取IPv6代理地址
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

// 检查是否为 IPv4 地址
function isIPv4(address) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Regex.test(address);
}

// 远程 Socket 到 WebSocket 的数据转发 - 严格按照原版逻辑
async function pipeRemoteToWebSocket(
  remoteSocket,
  ws,
  vlessHeader,
  retry = null
) {
  let headerSent = false;
  let hasIncomingData = false;

  remoteSocket.readable
    .pipeTo(
      new WritableStream({
        write(chunk) {
          hasIncomingData = true;
          if (ws.readyState === WS_READY_STATE_OPEN) {
            if (!headerSent) {
              const combined = new Uint8Array(
                vlessHeader.byteLength + chunk.byteLength
              );
              combined.set(new Uint8Array(vlessHeader), 0);
              combined.set(new Uint8Array(chunk), vlessHeader.byteLength);
              ws.send(combined.buffer);
              headerSent = true;
            } else {
              ws.send(chunk);
            }
          }
        },
        close() {
          // 关键：严格按照原版的retry触发逻辑
          if (!hasIncomingData && retry) {
            retry();
            return;
          }
          if (ws.readyState === WS_READY_STATE_OPEN) {
            ws.close(1000, "正常关闭");
          }
        },
        abort() {
          closeSocket(remoteSocket);
        },
      })
    )
    .catch((err) => {
      console.error("数据转发错误:", err);
      closeSocket(remoteSocket);
      if (ws.readyState === WS_READY_STATE_OPEN) {
        ws.close(1011, "数据传输错误");
      }
    });
}

function closeSocket(socket) {
  if (socket) {
    try {
      socket.close();
    } catch (e) {}
  }
}

// VLESS WebSocket 处理函数 - 严格按照原版逻辑
async function handlevlessWebSocket(request) {
  const wsPair = new WebSocketPair();
  const [clientWS, serverWS] = Object.values(wsPair);

  serverWS.accept();

  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
  const wsReadable = createWebSocketReadableStream(serverWS, earlyDataHeader);
  let remoteSocket = null;

  let udpStreamWrite = null;
  let isDns = false;

  wsReadable
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          if (isDns && udpStreamWrite) {
            return udpStreamWrite(chunk);
          }

          if (remoteSocket) {
            const writer = remoteSocket.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const result = parsevlessHeader(chunk, userID);
          if (result.hasError) {
            throw new Error(result.message);
          }

          const vlessRespHeader = new Uint8Array([result.vlessVersion[0], 0]);
          const rawClientData = chunk.slice(result.rawDataIndex);

          if (result.isUDP) {
            if (result.portRemote === 53) {
              isDns = true;
              // DNS UDP处理逻辑可以在这里添加
              throw new Error("UDP代理仅支持DNS(端口53)");
            } else {
              throw new Error("UDP代理仅支持DNS(端口53)");
            }
          }

          async function connectAndWrite(address, port) {
            const tcpSocket = await connect({
              hostname: address,
              port: port,
            });
            remoteSocket = tcpSocket;
            const writer = tcpSocket.writable.getWriter();
            await writer.write(rawClientData);
            writer.releaseLock();
            return tcpSocket;
          }

          async function retry() {
            try {
              const proxyIP = await getIPv6ProxyAddress(result.addressRemote);
              console.log(`尝试通过NAT64 IPv6地址 ${proxyIP} 连接...`);
              const tcpSocket = await connect({
                hostname: proxyIP,
                port: result.portRemote,
              });
              remoteSocket = tcpSocket;
              const writer = tcpSocket.writable.getWriter();
              await writer.write(rawClientData);
              writer.releaseLock();

              tcpSocket.closed
                .catch((error) => {
                  console.error("NAT64 IPv6连接关闭错误:", error);
                })
                .finally(() => {
                  if (serverWS.readyState === WS_READY_STATE_OPEN) {
                    serverWS.close(1000, "连接已关闭");
                  }
                });

              pipeRemoteToWebSocket(tcpSocket, serverWS, vlessRespHeader, null);
            } catch (err) {
              console.error("NAT64 IPv6连接失败:", err);
              serverWS.close(1011, "NAT64 IPv6连接失败: " + err.message);
            }
          }

          try {
            const tcpSocket = await connectAndWrite(
              result.addressRemote,
              result.portRemote
            );
            pipeRemoteToWebSocket(tcpSocket, serverWS, vlessRespHeader, retry);
          } catch (err) {
            console.error("连接失败:", err);
            serverWS.close(1011, "连接失败");
          }
        },
        close() {
          if (remoteSocket) {
            closeSocket(remoteSocket);
          }
        },
      })
    )
    .catch((err) => {
      console.error("WebSocket 错误:", err);
      closeSocket(remoteSocket);
      serverWS.close(1011, "内部错误");
    });

  return new Response(null, {
    status: 101,
    webSocket: clientWS,
  });
}

function createWebSocketReadableStream(ws, earlyDataHeader) {
  return new ReadableStream({
    start(controller) {
      ws.addEventListener("message", (event) => {
        controller.enqueue(event.data);
      });

      ws.addEventListener("close", () => {
        controller.close();
      });

      ws.addEventListener("error", (err) => {
        controller.error(err);
      });

      if (earlyDataHeader) {
        try {
          const decoded = atob(
            earlyDataHeader.replace(/-/g, "+").replace(/_/g, "/")
          );
          const data = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
          controller.enqueue(data.buffer);
        } catch (e) {}
      }
    },
  });
}

function parsevlessHeader(buffer, userID) {
  if (buffer.byteLength < 24) {
    return { hasError: true, message: "无效的头部长度" };
  }

  const view = new DataView(buffer);
  const version = new Uint8Array(buffer.slice(0, 1));

  const uuid = formatUUID(new Uint8Array(buffer.slice(1, 17)));
  if (uuid !== userID) {
    return { hasError: true, message: "无效的用户" };
  }

  const optionsLength = view.getUint8(17);
  const command = view.getUint8(18 + optionsLength);

  let isUDP = false;
  if (command === 1) {
  } else if (command === 2) {
    isUDP = true;
  } else {
    return { hasError: true, message: "不支持的命令，仅支持TCP(01)和UDP(02)" };
  }

  let offset = 19 + optionsLength;
  const port = view.getUint16(offset);
  offset += 2;

  const addressType = view.getUint8(offset++);
  let address = "";

  switch (addressType) {
    case 1: // IPv4
      address = Array.from(
        new Uint8Array(buffer.slice(offset, offset + 4))
      ).join(".");
      offset += 4;
      break;

    case 2: // 域名
      const domainLength = view.getUint8(offset++);
      address = new TextDecoder().decode(
        buffer.slice(offset, offset + domainLength)
      );
      offset += domainLength;
      break;

    case 3: // IPv6
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(view.getUint16(offset).toString(16).padStart(4, "0"));
        offset += 2;
      }
      address = ipv6.join(":").replace(/(^|:)0+(\w)/g, "$1$2");
      break;

    default:
      return { hasError: true, message: "不支持的地址类型" };
  }

  return {
    hasError: false,
    addressRemote: address,
    portRemote: port,
    rawDataIndex: offset,
    vlessVersion: version,
    isUDP,
  };
}

function formatUUID(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// 生成 VLESS 配置信息
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

// 主要的 Worker 导出
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const hostname = request.headers.get("Host");

      // WebSocket 升级请求处理
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader && upgradeHeader === "websocket") {
        return await handlevlessWebSocket(request);
      }

      // 路由处理
      switch (url.pathname) {
        case `/${userID}`: {
          return new Response(getvlessConfig(userID, hostname), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        default: {
          // 默认路由返回 request.cf 信息
          return new Response(JSON.stringify(request.cf, null, 4), {
            status: 200,
            headers: {
              "Content-Type": "application/json;charset=utf-8",
            },
          });
        }
      }
    } catch (err) {
      return new Response(err.toString());
    }
  },
};
