import { connect } from "cloudflare:sockets";

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

// =================================================================================
// 用户管理功能
// =================================================================================

// 简化的用户存储（使用内存，实际应该用数据库）
const users = new Map();
const sessions = new Map();
const sourceNodes = new Map(); // 存储用户的源节点

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateSessionId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// 用户注册
async function registerUser(username, password) {
  if (users.has(username)) {
    return { success: false, message: "用户名已存在" };
  }

  const userId = generateUUID();
  const userUuid = generateUUID();

  users.set(username, {
    id: userId,
    username: username,
    password: password, // 实际应该加密
    uuid: userUuid,
    createdAt: new Date().toISOString(),
  });

  // 为新用户创建默认源节点
  await createDefaultSourceNode(userId, userUuid);

  return {
    success: true,
    message: "注册成功",
    user: { id: userId, username, uuid: userUuid },
  };
}

// 用户登录
async function loginUser(username, password) {
  const user = users.get(username);
  if (!user || user.password !== password) {
    return { success: false, message: "用户名或密码错误" };
  }

  const sessionId = generateSessionId();
  sessions.set(sessionId, {
    userId: user.id,
    username: user.username,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: "登录成功",
    sessionId: sessionId,
    user: { id: user.id, username: user.username, uuid: user.uuid },
  };
}

// 验证会话
function validateSession(sessionId) {
  return sessions.get(sessionId);
}

// =================================================================================
// 源节点管理功能
// =================================================================================

// 生成NAT64源节点
function generateNAT64SourceNode(uuid, domain) {
  const port = 443;
  const nodeName = domain;

  return `vless://${uuid}@${domain}:${port}?encryption=none&security=tls&sni=${domain}&fp=randomized&type=ws&host=${domain}&path=%2F%3Fed%3D2560#${nodeName}`;
}

// 创建默认源节点
async function createDefaultSourceNode(userId, userUuid) {
  const domain = "fq8-cxq933.pages.dev"; // 使用实际的Pages域名
  const nodeId = generateUUID();

  const defaultNode = {
    id: nodeId,
    userId: userId,
    name: "系统默认NAT64源节点",
    type: "nat64",
    uuid: userUuid,
    domain: domain,
    port: 443,
    encryption: "none",
    security: "tls",
    sni: domain,
    fp: "randomized",
    type_ws: "ws",
    host: domain,
    path: "/?ed=2560",
    enabled: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    vlessUrl: generateNAT64SourceNode(userUuid, domain),
  };

  // 存储到内存中
  if (!sourceNodes.has(userId)) {
    sourceNodes.set(userId, []);
  }
  sourceNodes.get(userId).push(defaultNode);

  return defaultNode;
}

// 获取用户的源节点列表
function getUserSourceNodes(userId) {
  return sourceNodes.get(userId) || [];
}

// 创建新的源节点
async function createSourceNode(userId, nodeData) {
  const nodeId = generateUUID();
  const user = Array.from(users.values()).find((u) => u.id === userId);

  if (!user) {
    throw new Error("用户不存在");
  }

  const newNode = {
    id: nodeId,
    userId: userId,
    name: nodeData.name || "自定义源节点",
    type: nodeData.type || "nat64",
    uuid: nodeData.uuid || user.uuid,
    domain: nodeData.domain,
    port: nodeData.port || 443,
    encryption: nodeData.encryption || "none",
    security: nodeData.security || "tls",
    sni: nodeData.sni || nodeData.domain,
    fp: nodeData.fp || "randomized",
    type_ws: nodeData.type_ws || "ws",
    host: nodeData.host || nodeData.domain,
    path: nodeData.path || "/?ed=2560",
    enabled: nodeData.enabled !== false,
    isDefault: false,
    createdAt: new Date().toISOString(),
    vlessUrl: generateNAT64SourceNode(
      nodeData.uuid || user.uuid,
      nodeData.domain
    ),
  };

  if (!sourceNodes.has(userId)) {
    sourceNodes.set(userId, []);
  }
  sourceNodes.get(userId).push(newNode);

  return newNode;
}

// =================================================================================
// 基础VLESS功能
// =================================================================================

async function handleVlessWebSocket(request, env) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(
    webSocket,
    earlyDataHeader
  );

  let remoteSocketWapper = { value: null };

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

          const vlessHeader = chunk.slice(0, 47);
          const addressLength = vlessHeader[37];
          const address = new TextDecoder().decode(
            vlessHeader.slice(38, 38 + addressLength)
          );
          const port = new DataView(
            vlessHeader.slice(38 + addressLength, 38 + addressLength + 2)
          ).getUint16(0);
          const rawData = chunk.slice(38 + addressLength + 2);

          const tcpSocket = await connect({
            hostname: address,
            port: port,
          });
          remoteSocketWapper.value = tcpSocket;

          const writer = tcpSocket.writable.getWriter();
          await writer.write(rawData);
          writer.releaseLock();

          tcpSocket.closed
            .catch((error) => {
              console.error("TCP连接关闭错误:", error);
            })
            .finally(() => {
              if (webSocket.readyState === WS_READY_STATE_OPEN) {
                webSocket.close(1000, "连接已关闭");
              }
            });

          tcpSocket.readable.pipeTo(
            new WritableStream({
              write(chunk) {
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                  webSocket.send(chunk);
                }
              },
            })
          );
        },
      })
    )
    .catch((error) => {
      console.error("WebSocket流错误:", error);
      if (webSocket.readyState === WS_READY_STATE_OPEN) {
        webSocket.close(1011, "WebSocket流错误");
      }
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// =================================================================================
// 辅助函数
// =================================================================================

function makeReadableWebSocketStream(webSocket, earlyDataHeader) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocket.addEventListener("message", (event) => {
        if (readableStreamCancel) {
          return;
        }
        controller.enqueue(event.data);
      });
      webSocket.addEventListener("close", () => {
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocket.addEventListener("error", (err) => {
        if (readableStreamCancel) {
          return;
        }
        controller.error(err);
      });
    },
    cancel() {
      readableStreamCancel = true;
    },
  });
  return stream;
}

// =================================================================================
// API路由处理
// =================================================================================

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 获取Cookie中的session_id
  const cookies = request.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/session_id=([^;]+)/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  // 用户注册
  if (path === "/api/register" && request.method === "POST") {
    try {
      const { username, password } = await request.json();
      const result = await registerUser(username, password);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: "注册失败" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 用户登录
  if (path === "/api/login" && request.method === "POST") {
    try {
      const { username, password } = await request.json();
      const result = await loginUser(username, password);

      if (result.success) {
        return new Response(JSON.stringify(result), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session_id=${result.sessionId}; Path=/; HttpOnly; SameSite=Strict`,
          },
        });
      } else {
        return new Response(JSON.stringify(result), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: "登录失败" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 获取用户信息
  if (path === "/api/user" && request.method === "GET") {
    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, message: "未登录" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const session = validateSession(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ success: false, message: "会话无效" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const user = users.get(session.username);
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          uuid: user.uuid,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 获取源节点列表
  if (path === "/api/source-nodes" && request.method === "GET") {
    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, message: "未登录" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const session = validateSession(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ success: false, message: "会话无效" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userNodes = getUserSourceNodes(session.userId);
    return new Response(
      JSON.stringify({
        success: true,
        nodes: userNodes,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 创建源节点
  if (path === "/api/source-nodes" && request.method === "POST") {
    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, message: "未登录" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const session = validateSession(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ success: false, message: "会话无效" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      const nodeData = await request.json();
      const newNode = await createSourceNode(session.userId, nodeData);
      return new Response(
        JSON.stringify({
          success: true,
          message: "源节点创建成功",
          node: newNode,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: "创建源节点失败" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 获取用户列表（测试用）
  if (path === "/api/users" && request.method === "GET") {
    const userList = Array.from(users.values()).map((u) => ({
      id: u.id,
      username: u.username,
      uuid: u.uuid,
      createdAt: u.createdAt,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        users: userList,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ success: false, message: "API不存在" }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// =================================================================================
// 主处理函数
// =================================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理WebSocket升级
    if (request.headers.get("Upgrade") === "websocket") {
      return handleVlessWebSocket(request, env);
    }

    // 处理API请求
    if (path.startsWith("/api/")) {
      return handleAPI(request, env);
    }

    // 处理HTTP请求
    if (path === "/") {
      return new Response(
        "VLESS Worker with Source Node Management is running",
        {
          headers: { "Content-Type": "text/plain;charset=utf-8" },
        }
      );
    }

    if (path === "/test") {
      return new Response("Worker with source nodes is working!", {
        headers: { "Content-Type": "text/plain;charset=utf-8" },
      });
    }

    // 404处理
    return new Response("Not Found", { status: 404 });
  },
};
