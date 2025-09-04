import { connect } from "cloudflare:sockets";

const d1 = "129.159.84.71";
const s1 = 1;
const s2 = 2;

async function h1(request, env) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  const url = new URL(request.url);
  globalThis.pathName = url.pathname;
  globalThis.hostName = request.headers.get("Host");
  globalThis.urlOrigin = url.origin;
  globalThis.proxyIPs = d1;

  let address = "";
  let portWithRandomLog = "";
  const log = (info, event) => {};
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = f1(webSocket, earlyDataHeader, log);

  let remoteSocketWapper = { value: null };
  let udpStreamWrite = null;
  let isDns = false;

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
            protocolVersion = new Uint8Array([0, 0]),
            isUDP,
          } = await h2(chunk, env);

          address = addressRemote;
          portWithRandomLog = `${portRemote}--${Math.random()} ${
            isUDP ? "udp " : "tcp "
          } `;

          if (hasError) {
            throw new Error(message);
            return;
          }

          if (isUDP) {
            if (portRemote === 53) {
              isDns = true;
            } else {
              throw new Error("UDP only for DNS port 53");
              return;
            }
          }

          const responseHeader = new Uint8Array([protocolVersion[0], 0]);
          const rawClientData = chunk.slice(rawDataIndex);

          if (isDns) {
            const { write } = await h3(webSocket, responseHeader, log);
            udpStreamWrite = write;
            udpStreamWrite(rawClientData);
            return;
          }

          h4(
            remoteSocketWapper,
            addressRemote,
            portRemote,
            rawClientData,
            webSocket,
            responseHeader,
            log
          );
        },
        close() {},
        abort(reason) {},
      })
    )
    .catch((err) => {});

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function f1(webSocketServer, earlyDataHeader, log) {
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
        f2(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });

      webSocketServer.addEventListener("error", (err) => {
        controller.error(err);
      });

      const { earlyData, error } = f3(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    pull(controller) {},
    cancel(reason) {
      if (readableStreamCancel) {
        return;
      }
      readableStreamCancel = true;
      f2(webSocketServer);
    },
  });

  return stream;
}

function f2(webSocket) {
  try {
    if (webSocket.readyState === s1 || webSocket.readyState === s2) {
      webSocket.close();
    }
  } catch (error) {}
}

function f3(base64Str) {
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

async function h2(buffer, env) {
  if (buffer.byteLength < 24) {
    return {
      hasError: true,
      message: "invalid data",
    };
  }

  const version = new Uint8Array(buffer.slice(0, 1));
  let isValidUser = false;
  let isUDP = false;
  const slicedBuffer = new Uint8Array(buffer.slice(1, 17));
  const slicedBufferString = f4(slicedBuffer);

  try {
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE user_uuid = ?"
    )
      .bind(slicedBufferString)
      .first();
    isValidUser = !!user;
  } catch (e) {
    isValidUser = false;
  }

  if (!isValidUser) {
    return {
      hasError: true,
      message: "invalid user",
    };
  }

  const optLength = new Uint8Array(buffer.slice(17, 18))[0];
  const command = new Uint8Array(
    buffer.slice(18 + optLength, 18 + optLength + 1)
  )[0];

  if (command === 1) {
  } else if (command === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${command} not supported`,
    };
  }

  const portIndex = 18 + optLength + 1;
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(
    buffer.slice(addressIndex, addressIndex + 1)
  );

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";

  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
      ).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(
        buffer.slice(addressValueIndex, addressValueIndex + 1)
      )[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
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
      message: `addressValue is empty`,
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    protocolVersion: version,
    isUDP,
  };
}

function f4(arr, offset = 0) {
  const byteToHex = [];
  for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).slice(1));
  }
  const hexOctets = [];
  for (let i = offset, len = offset + 16; i < len; ++i) {
    hexOctets.push(byteToHex[arr[i]]);
  }
  const uuid = hexOctets.join("").toLowerCase();
  return [
    uuid.substring(0, 8),
    uuid.substring(8, 12),
    uuid.substring(12, 16),
    uuid.substring(16, 20),
    uuid.substring(20, 32),
  ].join("-");
}

async function h4(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  responseHeader,
  log
) {
  async function connectAndWrite(address, port) {
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
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();
    return tcpSocket;
  }

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

    tcpSocket.closed
      .catch((error) => {})
      .finally(() => {
        f2(webSocket);
      });

    f5(tcpSocket, webSocket, responseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  f5(tcpSocket, webSocket, responseHeader, retry, log);
}

async function f5(remoteSocket, webSocket, responseHeader, retry, log) {
  let remoteChunkCount = 0;
  let chunks = [];
  let header = responseHeader;
  let hasIncomingData = false;

  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk, controller) {
          hasIncomingData = true;
          if (webSocket.readyState !== s1) {
            controller.error("webSocket not open");
          }
          if (header) {
            webSocket.send(await new Blob([header, chunk]).arrayBuffer());
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {},
        abort(reason) {},
      })
    )
    .catch((error) => {
      f2(webSocket);
    });

  if (hasIncomingData === false && retry) {
    retry();
  }
}

async function h3(webSocket, responseHeader, log) {
  let isHeaderSent = false;
  const transformStream = new TransformStream({
    start() {},
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
          if (webSocket.readyState === s1) {
            if (isHeaderSent) {
              webSocket.send(
                await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer()
              );
            } else {
              webSocket.send(
                await new Blob([
                  responseHeader,
                  udpSizeBuffer,
                  dnsQueryResult,
                ]).arrayBuffer()
              );
              isHeaderSent = true;
            }
          }
        },
      })
    )
    .catch((error) => {});

  const writer = transformStream.writable.getWriter();

  return {
    write(chunk) {
      writer.write(chunk);
    },
  };
}

function g1(uuid) {
  const actualPagesDomain = globalThis.hostName || "your-domain.pages.dev";
  const port = 443;
  const nodeName = actualPagesDomain;

  return `${atob(
    "dmxlc3M="
  )}://${uuid}@${actualPagesDomain}:${port}?encryption=none&security=tls&sni=${actualPagesDomain}&fp=randomized&type=ws&host=${actualPagesDomain}&path=%2F%3Fed%3D2560#${nodeName}`;
}

function g2(config_data, config_name = null) {
  let proxyList = config_data.proxyIPs;
  let port = config_data.port;

  if (!proxyList && config_data.proxyIP) {
    proxyList = [config_data.proxyIP];
  }

  if (!port && config_data.proxyPort) {
    port = config_data.proxyPort;
  }

  const {
    uuid,
    domain,
    proxyIPs: defaultProxyIPs = [d1],
    port: defaultPort = 443,
    fingerprint = "randomized",
    alpn = "http/1.1",
  } = config_data;

  proxyList = proxyList || defaultProxyIPs;
  port = port || defaultPort;

  if (!uuid || !domain) {
    throw new Error("UUID and domain required");
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new Error("Invalid UUID format");
  }

  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!domainRegex.test(domain)) {
    throw new Error("Invalid domain format");
  }

  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error("Port must be 1-65535");
  }

  if (!Array.isArray(proxyList) || proxyList.length === 0) {
    throw new Error("Proxy list cannot be empty");
  }

  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  for (const ip of proxyList) {
    if (!ipRegex.test(ip)) {
      throw new Error(`Invalid IP: ${ip}`);
    }
  }

  const validFingerprints = [
    "chrome",
    "firefox",
    "safari",
    "randomized",
    "android",
    "edge",
    "360",
    "qq",
  ];
  if (!validFingerprints.includes(fingerprint)) {
    throw new Error(`Invalid fingerprint: ${fingerprint}`);
  }

  const validAlpns = ["http/1.1", "h2", "h3", "h2,http/1.1"];
  if (!validAlpns.includes(alpn)) {
    throw new Error(`Invalid ALPN: ${alpn}`);
  }

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

  const isTLS =
    portNum === 443 ||
    portNum === 8443 ||
    portNum === 2053 ||
    portNum === 2083 ||
    portNum === 2087 ||
    portNum === 2096;
  const security = isTLS ? "tls" : "none";

  const path = `${getRandomPath(16)}${
    proxyList.length ? `/${btoa(proxyList.join(","))}` : ""
  }`;
  const fullPath = `/${path}?ed=2560`;

  const params = [];
  params.push(`encryption=none`);
  params.push(`security=${security}`);

  if (isTLS) {
    params.push(`sni=${domain}`);
    params.push(`alpn=${encodeURIComponent(alpn)}`);
    params.push(`fp=${fingerprint}`);
  }

  params.push(`type=ws`);
  params.push(`host=${domain}`);
  params.push(`path=${encodeURIComponent(fullPath)}`);

  const remarks = config_name || `Proxy-${domain}`;
  const hashPart = encodeURIComponent(remarks);

  const standardUrl = `${atob(
    "dmxlc3M="
  )}://${uuid}@${domain}:${portNum}?${params.join("&")}#${hashPart}`;

  return standardUrl;
}

async function g3(userId, userUuid, env, hostName) {
  try {
    const actualDomain = hostName || "your-domain.pages.dev";

    const natNode = g1(userUuid);
    const natHash = g4(natNode);

    const proxyConfig = {
      uuid: userUuid,
      domain: actualDomain,
      proxyIPs: [d1],
      port: 443,
      fingerprint: "randomized",
      alpn: "http/1.1",
    };

    const proxyNode = g2(proxyConfig);
    const proxyHash = g4(proxyNode);

    const statements = [
      env.DB.prepare(
        "INSERT INTO source_node_configs (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        userId,
        "Default NAT64",
        "nat64",
        JSON.stringify({ uuid: userUuid, domain: actualDomain }),
        natNode,
        true,
        true
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, null, natNode, natHash, "active"),
      env.DB.prepare(
        "INSERT INTO source_node_configs (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        userId,
        "Default Proxy",
        "proxyip",
        JSON.stringify(proxyConfig),
        proxyNode,
        true,
        true
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, null, proxyNode, proxyHash, "active"),
    ];

    await env.DB.batch(statements);
  } catch (error) {}
}

function g4(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString();
}

async function g9(request, env) {
  const sessionId = request.headers
    .get("cookie")
    ?.split("; ")
    .find((cookie) => cookie.startsWith("session="))
    ?.split("=")[1];

  if (!sessionId) {
    return null;
  }

  const session = await env.DB.prepare(
    "SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > datetime('now')"
  )
    .bind(sessionId)
    .first();

  return session;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseRequestBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const result = {};
    for (const [key, value] of formData.entries()) {
      result[key] = value;
    }
    return result;
  } else {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
}

async function getPasswordColumnName(env) {
  try {
    const result = await env.DB.prepare("PRAGMA table_info(users)").all();
    const columns = result.results || result;
    const hasPasswordHash = columns.some((col) => col.name === "password_hash");
    const hasHashedPassword = columns.some(
      (col) => col.name === "hashed_password"
    );

    if (hasHashedPassword) return "hashed_password";
    if (hasPasswordHash) return "password_hash";
    return "password_hash";
  } catch {
    return "password_hash";
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/") {
      try {
        const html = await env.ASSETS.fetch(request);
        return html;
      } catch (e) {
        return new Response("Service unavailable", { status: 503 });
      }
    }

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            user_uuid TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS subscription_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            last_updated DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS node_pool (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            source_id INTEGER,
            node_url TEXT NOT NULL,
            node_hash TEXT UNIQUE,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (source_id) REFERENCES subscription_sources (id)
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            tag_name TEXT NOT NULL,
            tag_uuid TEXT UNIQUE,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS node_tag_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id INTEGER,
            node_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tag_id) REFERENCES tags (id),
            FOREIGN KEY (node_id) REFERENCES node_pool (id)
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS source_node_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            config_name TEXT NOT NULL,
            node_type TEXT NOT NULL CHECK (node_type IN ('nat64', 'proxyip')),
            config_data TEXT NOT NULL,
            generated_node TEXT NOT NULL,
            is_default BOOLEAN DEFAULT false,
            enabled BOOLEAN DEFAULT true,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )`
        ).run();
      } catch (e) {}
    }

    if (
      request.headers.get("upgrade") === "websocket" &&
      url.searchParams.get("ed") === "2560"
    ) {
      return await h1(request, env);
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      try {
        const { username, password } = await parseRequestBody(request);

        if (!username || !password) {
          return new Response(
            JSON.stringify({ error: "Username and password required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const existingUser = await env.DB.prepare(
          "SELECT id FROM users WHERE username = ?"
        )
          .bind(username)
          .first();

        if (existingUser) {
          return new Response(JSON.stringify({ error: "Username exists" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const hashedPassword = await hashPassword(password);
        const userUuid = crypto.randomUUID();

        const passwordColumn = await getPasswordColumnName(env);
        const insertResult = await env.DB.prepare(
          `INSERT INTO users (username, ${passwordColumn}, user_uuid) VALUES (?, ?, ?)`
        )
          .bind(username, hashedPassword, userUuid)
          .run();

        const newUserId = insertResult.meta.last_row_id;

        if (newUserId) {
          const currentHostName =
            request.headers.get("Host") || "your-worker.workers.dev";
          await g3(newUserId, userUuid, env, currentHostName);
        }

        return new Response(
          JSON.stringify({ message: "Registration successful" }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: "Registration failed",
            details: e.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const { username, password } = await parseRequestBody(request);

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ?"
        )
          .bind(username)
          .first();

        const passwordColumn = await getPasswordColumnName(env);
        if (!user || (await hashPassword(password)) !== user[passwordColumn]) {
          return new Response(
            JSON.stringify({ error: "Invalid credentials" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        await env.DB.prepare(
          "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
        )
          .bind(sessionId, user.id, expiresAt)
          .run();

        const response = new Response(
          JSON.stringify({
            message: "Login successful",
            username: user.username,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
        response.headers.set(
          "Set-Cookie",
          `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${
            86400 * 7
          }; Path=/`
        );
        return response;
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: "Login failed",
            details: e.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      const sessionId = request.headers
        .get("cookie")
        ?.split("; ")
        .find((cookie) => cookie.startsWith("session="))
        ?.split("=")[1];

      if (sessionId) {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
          .bind(sessionId)
          .run();
      }

      const response = new Response(
        JSON.stringify({ message: "Logout successful" })
      );
      response.headers.set(
        "Set-Cookie",
        "session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/"
      );
      return response;
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const user = await g9(request, env);
      if (!user) {
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          authenticated: true,
          username: user.username,
          user_uuid: user.user_uuid,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.pathname === "/api/tags" && request.method === "GET") {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });

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

        const tagIds = tags.map((t) => t.id);
        const placeholders = tagIds.map(() => "?").join(",");

        const { results: counts } = await env.DB.prepare(
          `SELECT tag_id, COUNT(node_id) as node_count, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count FROM node_tag_map LEFT JOIN node_pool ON node_pool.id = node_tag_map.node_id WHERE tag_id IN (${placeholders}) GROUP BY tag_id`
        )
          .bind(...tagIds)
          .all();

        const countMap = new Map(
          counts.map((c) => [
            c.tag_id,
            { node_count: c.node_count, active_count: c.active_count || 0 },
          ])
        );

        const resultsWithCounts = tags.map((tag) => ({
          ...tag,
          node_count: countMap.get(tag.id)?.node_count || 0,
          active_count: countMap.get(tag.id)?.active_count || 0,
        }));

        return new Response(JSON.stringify(resultsWithCounts), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: `Operation failed: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/source-nodes" && request.method === "GET") {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });

        const { results } = await env.DB.prepare(
          `SELECT id, config_name, node_type, config_data, generated_node, is_default, enabled, created_at FROM source_node_configs WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`
        )
          .bind(user.id)
          .all();

        return new Response(JSON.stringify(results || []), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: `Operation failed: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/source-nodes" && request.method === "POST") {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });

        const { config_name, node_type, config_data } = await request.json();

        if (node_type === "proxyip") {
          config_data.domain =
            request.headers.get("Host") || "your-domain.pages.dev";

          if (config_data.uuid !== user.user_uuid) {
            config_data.uuid = user.user_uuid;
          }
        }

        if (!node_type || !config_data) {
          return new Response(
            JSON.stringify({ error: "Node type and config data required" }),
            {
              status: 400,
            }
          );
        }

        if (!["nat64", "proxyip"].includes(node_type)) {
          return new Response(
            JSON.stringify({ error: "Node type must be nat64 or proxyip" }),
            {
              status: 400,
            }
          );
        }

        let generatedNode;
        if (node_type === "nat64") {
          if (!config_data.uuid) {
            return new Response(
              JSON.stringify({ error: "NAT64 config requires uuid parameter" }),
              {
                status: 400,
              }
            );
          }
          generatedNode = g1(config_data.uuid);
        } else if (node_type === "proxyip") {
          if (!config_data.uuid) {
            return new Response(
              JSON.stringify({
                error: "ProxyIP config requires uuid parameter",
              }),
              {
                status: 400,
              }
            );
          }

          if (config_data.proxyIPs && !Array.isArray(config_data.proxyIPs)) {
            return new Response(
              JSON.stringify({ error: "proxyIPs must be array format" }),
              {
                status: 400,
              }
            );
          }

          generatedNode = g2(config_data, config_name);
        }

        const nodeHash = g4(generatedNode);

        const insertResult = await env.DB.prepare(
          "INSERT INTO source_node_configs (user_id, config_name, node_type, config_data, generated_node, is_default, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            user.id,
            config_name,
            node_type,
            JSON.stringify(config_data),
            generatedNode,
            false,
            true
          )
          .run();

        const sourceNodeId = insertResult.meta.last_row_id;

        if (nodeHash && sourceNodeId) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, ?)"
          )
            .bind(user.id, sourceNodeId, generatedNode, nodeHash, "active")
            .run();
        }

        return new Response(
          JSON.stringify({
            message: "Source node configuration created successfully",
            config_id: sourceNodeId,
            generated_node: generatedNode,
            config_data: {
              uuid: config_data.uuid,
              domain: config_data.domain,
              proxyIPs: config_data.proxyIPs,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: "Operation failed",
            details: e.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/nodes" && request.method === "GET") {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });

        const { results } = await env.DB.prepare(
          `SELECT p.id, p.node_url, p.created_at, s.source_name FROM node_pool p JOIN subscription_sources s ON p.source_id = s.id WHERE p.user_id = ? ORDER BY s.source_name, p.id`
        )
          .bind(user.id)
          .all();

        const nodesWithNames = results.map((node) => {
          const protocol = node.node_url.split("://")[0] || "unknown";
          return {
            ...node,
            node_name: "Node",
            protocol: protocol,
            server: "unknown",
          };
        });

        return new Response(JSON.stringify(nodesWithNames || []), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: `Operation failed: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (
      url.pathname === "/api/subscription-sources" &&
      request.method === "GET"
    ) {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
        return new Response(
          JSON.stringify({
            error: `Operation failed: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname.includes("/import-to-tag") && request.method === "POST") {
      try {
        const user = await g9(request, env);
        if (!user)
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });

        const configId = url.pathname.split("/")[3];
        if (!configId || isNaN(parseInt(configId))) {
          return new Response(JSON.stringify({ error: "Invalid config ID" }), {
            status: 400,
          });
        }

        const { tag_id } = await parseRequestBody(request);

        const sourceConfig = await env.DB.prepare(
          "SELECT id, config_name, generated_node FROM source_node_configs WHERE user_id = ? AND id = ?"
        )
          .bind(user.id, parseInt(configId))
          .first();

        if (!sourceConfig) {
          return new Response(
            JSON.stringify({ error: "Source config not found" }),
            {
              status: 404,
            }
          );
        }

        let targetTagId = tag_id;
        if (tag_id) {
          const tag = await env.DB.prepare(
            "SELECT id, tag_name FROM tags WHERE user_id = ? AND id = ?"
          )
            .bind(user.id, parseInt(tag_id))
            .first();

          if (!tag) {
            return new Response(JSON.stringify({ error: "Tag not found" }), {
              status: 404,
            });
          }
        }

        const nodeHash = g4(sourceConfig.generated_node);
        const existingNode = await env.DB.prepare(
          "SELECT id FROM node_pool WHERE user_id = ? AND node_hash = ?"
        )
          .bind(user.id, nodeHash)
          .first();

        let nodeId;
        if (existingNode) {
          nodeId = existingNode.id;
        } else {
          const insertResult = await env.DB.prepare(
            "INSERT INTO node_pool (user_id, source_id, node_url, node_hash, status) VALUES (?, ?, ?, ?, ?)"
          )
            .bind(
              user.id,
              null,
              sourceConfig.generated_node,
              nodeHash,
              "active"
            )
            .run();
          nodeId = insertResult.meta.last_row_id;
        }

        if (targetTagId) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO node_tag_map (tag_id, node_id) VALUES (?, ?)"
          )
            .bind(parseInt(targetTagId), nodeId)
            .run();
        }

        return new Response(
          JSON.stringify({
            message: "Import successful",
            node_id: nodeId,
            tag_id: targetTagId,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: `Operation failed: ${e.message}`,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
