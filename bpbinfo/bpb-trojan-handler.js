// =================================================================================
// BPB Trojan 协议处理模块
// 基于 BPB 分析，实现完整的 Trojan 协议支持，包括 WebSocket over TLS
// =================================================================================

/**
 * BPB Trojan 协议处理器
 * 实现标准 Trojan 协议和 BPB 增强功能
 */
export class BPBTrojanHandler {
  constructor(bpbConfig) {
    this.bpbConfig = bpbConfig;
    this.trojanPassword = bpbConfig.TR_PASS;
    this.proxyIP = bpbConfig.PROXY_IP;
    this.fallback = bpbConfig.FALLBACK;
    
    // 预计算密码哈希 (延迟初始化，避免构造函数中的异步操作)
    this.hashedPassword = null;
    this.passwordInitialized = false;
    
    // Trojan 协议配置
    this.protocolVersion = 1;
    this.commandConnect = 1;
    this.commandUdp = 3;
    
    // 地址类型
    this.addressTypes = {
      IPv4: 1,
      DOMAIN: 3,
      IPv6: 4
    };
    
    // 支持的端口 (基于 BPB 分析)
    this.supportedPorts = {
      tls: [443, 2053, 2083, 2087, 2096, 8443],
      plain: [80, 8080, 8880, 2052, 2082, 2086, 2095]
    };
  }

  /**
   * 初始化密码哈希 (懒加载)
   */
  async initializePasswordHash() {
    if (this.passwordInitialized) return;
    
    try {
      this.hashedPassword = await this.sha224Hash(this.trojanPassword);
      this.passwordInitialized = true;
    } catch (error) {
      console.error('Trojan 密码哈希初始化失败:', error);
      // 在非 Cloudflare Workers 环境中，我们可以继续运行
      if (error.message.includes('Unrecognized algorithm name')) {
        console.warn('SHA-224 不可用，将在实际使用时初始化');
        this.passwordInitialized = false;
      } else {
        throw error;
      }
    }
  }

  /**
   * 计算 SHA224 哈希
   * @param {string} input - 输入字符串
   * @returns {Promise<Uint8Array>} SHA224 哈希值 (28字节)
   */
  async sha224Hash(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-224', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * 处理 Trojan WebSocket 连接
   * @param {WebSocket} webSocket - WebSocket 连接
   * @param {Request} request - HTTP 请求
   * @param {Object} env - 环境变量
   * @returns {Promise<Response>} WebSocket 响应
   */
  async handleTrojanWebSocket(webSocket, request, env) {
    const log = (message) => console.log(`[Trojan] ${message}`);
    
    try {
      webSocket.accept();
      log('Trojan WebSocket 连接已接受');
      
      // 设置消息处理器
      webSocket.addEventListener('message', async (event) => {
        try {
          await this.handleTrojanMessage(event.data, webSocket, env, log);
        } catch (error) {
          log(`消息处理错误: ${error.message}`);
          webSocket.close(1000, 'Processing error');
        }
      });
      
      // 设置连接关闭处理器
      webSocket.addEventListener('close', () => {
        log('Trojan WebSocket 连接已关闭');
      });
      
      // 设置错误处理器
      webSocket.addEventListener('error', (error) => {
        log(`WebSocket 错误: ${error}`);
      });
      
      return new Response(null, {
        status: 101,
        webSocket: webSocket,
      });
      
    } catch (error) {
      log(`WebSocket 处理失败: ${error.message}`);
      return new Response('Trojan WebSocket setup failed', { status: 500 });
    }
  }

  /**
   * 处理 Trojan 消息
   * @param {ArrayBuffer} data - 消息数据
   * @param {WebSocket} webSocket - WebSocket 连接
   * @param {Object} env - 环境变量
   * @param {Function} log - 日志函数
   */
  async handleTrojanMessage(data, webSocket, env, log) {
    const dataArray = new Uint8Array(data);
    
    // 验证 Trojan 协议
    const validation = await this.validateTrojanRequest(dataArray);
    if (!validation.valid) {
      log(`Trojan 验证失败: ${validation.error}`);
      webSocket.close(1000, 'Invalid Trojan request');
      return;
    }
    
    // 解析 Trojan 请求
    const request = this.parseTrojanRequest(dataArray);
    if (!request) {
      log('Trojan 请求解析失败');
      webSocket.close(1000, 'Invalid request format');
      return;
    }
    
    log(`Trojan 请求: ${request.targetHost}:${request.targetPort}`);
    
    // 建立到目标的连接
    await this.handleTrojanTraffic(webSocket, request, env, log);
  }

  /**
   * 验证 Trojan 请求
   * @param {Uint8Array} data - 请求数据
   * @returns {Promise<Object>} 验证结果
   */
  async validateTrojanRequest(data) {
    if (data.length < 28) {
      return { valid: false, error: '数据长度不足' };
    }
    
    // 提取密码哈希 (前28字节)
    const receivedHash = data.slice(0, 28);
    
    // 确保密码哈希已初始化
    if (!this.hashedPassword) {
      await this.initializePasswordHash();
    }
    
    // 比较哈希值
    if (!this.compareHashes(receivedHash, this.hashedPassword)) {
      return { valid: false, error: '密码验证失败' };
    }
    
    return { valid: true };
  }

  /**
   * 比较两个哈希值
   * @param {Uint8Array} hash1 - 哈希值1
   * @param {Uint8Array} hash2 - 哈希值2
   * @returns {boolean} 是否相等
   */
  compareHashes(hash1, hash2) {
    if (hash1.length !== hash2.length) return false;
    
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) return false;
    }
    
    return true;
  }

  /**
   * 解析 Trojan 请求
   * @param {Uint8Array} data - 请求数据
   * @returns {Object|null} 解析结果
   */
  parseTrojanRequest(data) {
    try {
      let offset = 28; // 跳过密码哈希
      
      // 跳过 CRLF
      if (data[offset] === 0x0D && data[offset + 1] === 0x0A) {
        offset += 2;
      } else {
        return null;
      }
      
      // 读取命令 (1字节)
      const command = data[offset];
      offset += 1;
      
      if (command !== this.commandConnect) {
        throw new Error(`不支持的命令: ${command}`);
      }
      
      // 读取地址类型 (1字节)
      const addressType = data[offset];
      offset += 1;
      
      // 读取地址
      let targetHost;
      let addressLength;
      
      switch (addressType) {
        case this.addressTypes.IPv4:
          addressLength = 4;
          targetHost = Array.from(data.slice(offset, offset + addressLength)).join('.');
          break;
          
        case this.addressTypes.DOMAIN:
          addressLength = data[offset];
          offset += 1;
          targetHost = new TextDecoder().decode(data.slice(offset, offset + addressLength));
          break;
          
        case this.addressTypes.IPv6:
          addressLength = 16;
          const ipv6Parts = [];
          for (let i = 0; i < 8; i++) {
            const part = (data[offset + i * 2] << 8) | data[offset + i * 2 + 1];
            ipv6Parts.push(part.toString(16));
          }
          targetHost = ipv6Parts.join(':');
          break;
          
        default:
          throw new Error(`不支持的地址类型: ${addressType}`);
      }
      
      offset += addressLength;
      
      // 读取端口 (2字节，大端序)
      const targetPort = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      
      // 跳过 CRLF
      if (data[offset] === 0x0D && data[offset + 1] === 0x0A) {
        offset += 2;
      }
      
      // 剩余数据作为载荷
      const payload = data.slice(offset);
      
      return {
        command,
        addressType,
        targetHost,
        targetPort,
        payload,
        headerLength: offset
      };
      
    } catch (error) {
      console.error('Trojan 请求解析错误:', error);
      return null;
    }
  }

  /**
   * 处理 Trojan 流量转发
   * @param {WebSocket} webSocket - WebSocket 连接
   * @param {Object} request - 解析的请求
   * @param {Object} env - 环境变量
   * @param {Function} log - 日志函数
   */
  async handleTrojanTraffic(webSocket, request, env, log) {
    try {
      // 尝试通过 ProxyIP 建立连接
      let targetConnection;
      
      try {
        // 导入 ProxyIP 核心模块
        const { BPBProxyIPCore } = await import('./bpb-proxyip-core.js');
        const proxyIPCore = new BPBProxyIPCore(this.bpbConfig);
        
        targetConnection = await proxyIPCore.connectViaProxyIP(
          request.targetHost,
          request.targetPort,
          { log }
        );
        
        log(`通过 ProxyIP 连接到 ${request.targetHost}:${request.targetPort} 成功`);
      } catch (proxyError) {
        log(`ProxyIP 连接失败: ${proxyError.message}，尝试直连`);
        
        // 回退到直连
        targetConnection = await connect({
          hostname: request.targetHost,
          port: request.targetPort,
        });
        
        log(`直连到 ${request.targetHost}:${request.targetPort} 成功`);
      }
      
      // 如果有初始载荷，发送给目标
      if (request.payload && request.payload.length > 0) {
        const writer = targetConnection.writable.getWriter();
        await writer.write(request.payload);
        writer.releaseLock();
      }
      
      // 建立双向数据流
      this.setupBidirectionalStream(webSocket, targetConnection, log);
      
    } catch (error) {
      log(`连接建立失败: ${error.message}`);
      webSocket.close(1000, 'Connection failed');
    }
  }

  /**
   * 建立双向数据流
   * @param {WebSocket} webSocket - WebSocket 连接
   * @param {Object} targetConnection - 目标连接
   * @param {Function} log - 日志函数
   */
  setupBidirectionalStream(webSocket, targetConnection, log) {
    // WebSocket -> 目标连接
    webSocket.addEventListener('message', async (event) => {
      try {
        const writer = targetConnection.writable.getWriter();
        await writer.write(new Uint8Array(event.data));
        writer.releaseLock();
      } catch (error) {
        log(`WebSocket -> 目标 数据转发失败: ${error.message}`);
        webSocket.close();
      }
    });
    
    // 目标连接 -> WebSocket
    targetConnection.readable.pipeTo(
      new WritableStream({
        async write(chunk) {
          if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(chunk);
          }
        },
        close() {
          log('目标连接已关闭');
          if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.close();
          }
        },
        abort(reason) {
          log(`目标连接中断: ${reason}`);
          if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.close();
          }
        }
      })
    ).catch(error => {
      log(`目标 -> WebSocket 数据转发失败: ${error.message}`);
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.close();
      }
    });
    
    // WebSocket 关闭时关闭目标连接
    webSocket.addEventListener('close', () => {
      try {
        targetConnection.close();
      } catch (error) {
        // 忽略关闭错误
      }
    });
  }

  /**
   * 生成 Trojan 节点配置
   * @param {string} password - Trojan 密码
   * @param {string} domain - Pages 域名
   * @param {number} port - 端口
   * @returns {string} Trojan 节点链接
   */
  generateTrojanNode(password, domain, port = 443) {
    const nodeName = `BPB-Trojan-${domain}-${port}`;
    
    // BPB Trojan 风格的配置参数
    const params = {
      type: 'ws',
      security: 'tls',
      path: '/',
      host: this.proxyIP, // 使用 ProxyIP 作为 Host
      sni: this.proxyIP,  // 使用 ProxyIP 作为 SNI
      alpn: 'h2,http/1.1',
      fp: 'chrome'
    };

    const paramString = new URLSearchParams(params).toString();
    return `trojan://${password}@${domain}:${port}?${paramString}#${encodeURIComponent(nodeName)}`;
  }

  /**
   * 检测协议类型
   * @param {Request} request - HTTP 请求
   * @returns {string|null} 协议类型
   */
  static detectTrojanProtocol(request) {
    const protocol = request.headers.get('sec-websocket-protocol');
    if (protocol && protocol.includes('trojan')) {
      return 'trojan';
    }
    
    // 检查 User-Agent
    const userAgent = request.headers.get('user-agent');
    if (userAgent && userAgent.includes('trojan')) {
      return 'trojan';
    }
    
    return null;
  }

  /**
   * 生成多端口 Trojan 节点集合
   * @param {string} password - Trojan 密码
   * @param {string} domain - Pages 域名
   * @returns {Array} 节点数组
   */
  generateTrojanNodeSet(password, domain) {
    const nodes = [];
    
    // TLS 端口节点
    this.supportedPorts.tls.forEach(port => {
      nodes.push({
        type: 'trojan-tls',
        port: port,
        url: this.generateTrojanNode(password, domain, port),
        name: `BPB-Trojan-TLS-${port}`,
        priority: port === 443 ? 'high' : 'medium'
      });
    });

    return nodes;
  }

  /**
   * 获取 Trojan 处理器状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      protocol: 'trojan',
      proxyIP: this.proxyIP,
      hashedPasswordLength: this.hashedPassword ? this.hashedPassword.length : 0,
      supportedPorts: this.supportedPorts,
      isReady: !!this.hashedPassword
    };
  }
}