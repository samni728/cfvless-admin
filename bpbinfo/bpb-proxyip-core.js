// =================================================================================
// BPB ProxyIP 核心模块
// 基于 BPB 分析，实现完整的 ProxyIP 功能，包括连接池、健康检查、智能路由
// =================================================================================

/**
 * BPB ProxyIP 核心处理器
 * 提供完整的 ProxyIP 功能，包括连接管理、健康检查、性能优化
 */
export class BPBProxyIPCore {
  constructor(bpbConfig) {
    this.bpbConfig = bpbConfig;
    this.proxyIP = bpbConfig.PROXY_IP; // bpb.yousef.isegaro.com
    this.fallback = bpbConfig.FALLBACK; // speed.cloudflare.com
    
    // 连接池配置
    this.connectionPool = new Map();
    this.maxPoolSize = 50;
    this.connectionTimeout = 30000; // 30秒
    this.maxRetries = 3;
    
    // 健康检查配置
    this.healthCheckInterval = 60000; // 1分钟
    this.healthCheckTimeout = 5000; // 5秒
    this.isHealthy = true;
    this.lastHealthCheck = null;
    
    // 性能统计
    this.stats = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      avgResponseTime: 0,
      lastResponseTime: 0
    };
    
    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 通过 ProxyIP 建立连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 连接对象
   */
  async connectViaProxyIP(targetHost, targetPort, options = {}) {
    const startTime = Date.now();
    const connectionKey = `${targetHost}:${targetPort}`;
    
    try {
      this.stats.totalConnections++;
      
      // 检查连接池
      if (options.usePool !== false) {
        const pooledConnection = this.getPooledConnection(connectionKey);
        if (pooledConnection) {
          this.updateStats(startTime, true);
          return pooledConnection;
        }
      }
      
      // 创建新连接
      const connection = await this.createProxyIPConnection(targetHost, targetPort, options);
      
      // 添加到连接池
      if (options.usePool !== false) {
        this.addToPool(connectionKey, connection);
      }
      
      this.stats.successfulConnections++;
      this.updateStats(startTime, true);
      
      return connection;
    } catch (error) {
      this.stats.failedConnections++;
      this.updateStats(startTime, false);
      throw error;
    }
  }

  /**
   * 创建 ProxyIP 连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 连接对象
   */
  async createProxyIPConnection(targetHost, targetPort, options = {}) {
    const log = options.log || ((msg) => console.log(`[ProxyIP] ${msg}`));
    
    // 检查 ProxyIP 健康状态
    if (!this.isHealthy && !options.forceConnect) {
      throw new Error(`ProxyIP ${this.proxyIP} 当前不健康，拒绝连接`);
    }
    
    log(`通过 ProxyIP ${this.proxyIP} 连接到 ${targetHost}:${targetPort}`);
    
    // 建立到 ProxyIP 的连接
    const proxyConnection = await this.connectToProxyServer(options);
    
    // 建立隧道
    await this.establishTunnel(proxyConnection, targetHost, targetPort, options);
    
    // 包装连接对象，添加元数据
    const wrappedConnection = this.wrapConnection(proxyConnection, targetHost, targetPort);
    
    log(`ProxyIP 连接建立成功`);
    return wrappedConnection;
  }

  /**
   * 连接到 ProxyIP 服务器
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 代理连接
   */
  async connectToProxyServer(options = {}) {
    const connectOptions = {
      hostname: this.proxyIP,
      port: options.proxyPort || 443,
      secureTransport: "starttls"
    };
    
    // 设置连接超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('ProxyIP 连接超时')), this.connectionTimeout);
    });
    
    const connectPromise = connect(connectOptions);
    
    return Promise.race([connectPromise, timeoutPromise]);
  }

  /**
   * 建立 HTTP CONNECT 隧道
   * @param {Object} proxyConnection - 代理连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {Object} options - 选项
   */
  async establishTunnel(proxyConnection, targetHost, targetPort, options = {}) {
    const log = options.log || ((msg) => console.log(`[ProxyIP] ${msg}`));
    
    // 构建 CONNECT 请求
    const connectRequest = this.buildConnectRequest(targetHost, targetPort, options);
    
    // 发送 CONNECT 请求
    const writer = proxyConnection.writable.getWriter();
    await writer.write(new TextEncoder().encode(connectRequest));
    writer.releaseLock();
    
    // 读取代理响应
    const response = await this.readProxyResponse(proxyConnection, options);
    
    // 验证响应
    if (!response.includes('200 Connection established')) {
      throw new Error(`ProxyIP 隧道建立失败: ${response.split('\r\n')[0]}`);
    }
    
    log(`ProxyIP 隧道建立成功`);
  }

  /**
   * 构建 HTTP CONNECT 请求
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {Object} options - 选项
   * @returns {string} CONNECT 请求字符串
   */
  buildConnectRequest(targetHost, targetPort, options = {}) {
    const userAgent = options.userAgent || 'BPB-ProxyIP-Client/1.0';
    const proxyAuth = options.proxyAuth || '';
    
    let request = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
    request += `Host: ${targetHost}:${targetPort}\r\n`;
    request += `User-Agent: ${userAgent}\r\n`;
    request += `Proxy-Connection: keep-alive\r\n`;
    
    // 添加代理认证 (如果需要)
    if (proxyAuth) {
      request += `Proxy-Authorization: Basic ${btoa(proxyAuth)}\r\n`;
    }
    
    // BPB 特有的头部 (基于分析)
    request += `X-BPB-Client: Enhanced\r\n`;
    request += `X-Forwarded-Proto: https\r\n`;
    
    request += `\r\n`;
    
    return request;
  }

  /**
   * 读取代理服务器响应
   * @param {Object} proxyConnection - 代理连接
   * @param {Object} options - 选项
   * @returns {Promise<string>} 响应字符串
   */
  async readProxyResponse(proxyConnection, options = {}) {
    const timeout = options.responseTimeout || 10000; // 10秒超时
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('读取 ProxyIP 响应超时')), timeout);
    });
    
    const readPromise = new Promise(async (resolve, reject) => {
      try {
        const reader = proxyConnection.readable.getReader();
        const { value } = await reader.read();
        reader.releaseLock();
        
        if (!value) {
          reject(new Error('ProxyIP 响应为空'));
          return;
        }
        
        const response = new TextDecoder().decode(value);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });
    
    return Promise.race([readPromise, timeoutPromise]);
  }

  /**
   * 包装连接对象，添加元数据和方法
   * @param {Object} connection - 原始连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @returns {Object} 包装后的连接
   */
  wrapConnection(connection, targetHost, targetPort) {
    return {
      ...connection,
      _proxyIP: this.proxyIP,
      _targetHost: targetHost,
      _targetPort: targetPort,
      _createdAt: new Date(),
      _isProxyIPConnection: true,
      
      // 添加连接信息方法
      getConnectionInfo() {
        return {
          proxyIP: this._proxyIP,
          target: `${this._targetHost}:${this._targetPort}`,
          createdAt: this._createdAt,
          type: 'ProxyIP'
        };
      },
      
      // 添加健康检查方法
      async isAlive() {
        try {
          return this.readyState === 1; // WebSocket OPEN state
        } catch {
          return false;
        }
      }
    };
  }

  /**
   * 获取连接池中的连接
   * @param {string} connectionKey - 连接键
   * @returns {Object|null} 连接对象或null
   */
  getPooledConnection(connectionKey) {
    const poolEntry = this.connectionPool.get(connectionKey);
    if (!poolEntry) return null;
    
    // 检查连接是否仍然有效
    if (Date.now() - poolEntry.createdAt > this.connectionTimeout) {
      this.connectionPool.delete(connectionKey);
      try {
        poolEntry.connection.close();
      } catch (e) {
        // 忽略关闭错误
      }
      return null;
    }
    
    // 检查连接状态
    if (!poolEntry.connection.isAlive || !poolEntry.connection.isAlive()) {
      this.connectionPool.delete(connectionKey);
      return null;
    }
    
    return poolEntry.connection;
  }

  /**
   * 添加连接到连接池
   * @param {string} connectionKey - 连接键
   * @param {Object} connection - 连接对象
   */
  addToPool(connectionKey, connection) {
    // 检查连接池大小
    if (this.connectionPool.size >= this.maxPoolSize) {
      // 移除最旧的连接
      const oldestKey = this.connectionPool.keys().next().value;
      const oldestEntry = this.connectionPool.get(oldestKey);
      this.connectionPool.delete(oldestKey);
      
      try {
        oldestEntry.connection.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
    
    this.connectionPool.set(connectionKey, {
      connection,
      createdAt: Date.now()
    });
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      // 尝试连接到 ProxyIP
      const testConnection = await Promise.race([
        this.connectToProxyServer({ proxyPort: 443 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('健康检查超时')), this.healthCheckTimeout)
        )
      ]);
      
      // 立即关闭测试连接
      try {
        testConnection.close();
      } catch (e) {
        // 忽略关闭错误
      }
      
      this.isHealthy = true;
      this.lastHealthCheck = {
        timestamp: new Date(),
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
      
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = {
        timestamp: new Date(),
        status: 'unhealthy',
        error: error.message,
        responseTime: Date.now() - startTime
      };
      
      console.warn(`ProxyIP ${this.proxyIP} 健康检查失败:`, error.message);
    }
  }

  /**
   * 更新性能统计
   * @param {number} startTime - 开始时间
   * @param {boolean} success - 是否成功
   */
  updateStats(startTime, success) {
    const responseTime = Date.now() - startTime;
    this.stats.lastResponseTime = responseTime;
    
    // 计算平均响应时间 (简单移动平均)
    if (this.stats.avgResponseTime === 0) {
      this.stats.avgResponseTime = responseTime;
    } else {
      this.stats.avgResponseTime = (this.stats.avgResponseTime * 0.9) + (responseTime * 0.1);
    }
  }

  /**
   * 清理连接池
   */
  cleanupConnectionPool() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.connectionPool.entries()) {
      if (now - entry.createdAt > this.connectionTimeout) {
        keysToDelete.push(key);
        try {
          entry.connection.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
    }
    
    keysToDelete.forEach(key => this.connectionPool.delete(key));
  }

  /**
   * 获取 ProxyIP 状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      proxyIP: this.proxyIP,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      connectionPool: {
        size: this.connectionPool.size,
        maxSize: this.maxPoolSize
      },
      stats: { ...this.stats }
    };
  }

  /**
   * 生成 ProxyIP 增强的节点配置
   * @param {string} uuid - 用户 UUID
   * @param {string} domain - Pages 域名
   * @param {number} port - 端口
   * @returns {string} VLESS 节点链接
   */
  generateProxyIPNode(uuid, domain, port = 443) {
    const nodeName = `BPB-ProxyIP-${domain}-${port}`;
    
    // BPB ProxyIP 风格的配置参数
    const params = {
      encryption: 'none',
      security: 'tls',
      sni: this.proxyIP, // 关键：使用 ProxyIP 作为 SNI
      fp: 'chrome', // ProxyIP 使用 chrome 指纹
      type: 'ws',
      host: this.proxyIP, // 关键：Host 头使用 ProxyIP
      path: '/', // ProxyIP 使用根路径
      alpn: 'h2,http/1.1'
    };

    const paramString = new URLSearchParams(params).toString();
    return `vless://${uuid}@${domain}:${port}?${paramString}#${encodeURIComponent(nodeName)}`;
  }

  /**
   * 销毁 ProxyIP 核心实例
   */
  destroy() {
    // 清理所有连接
    for (const [key, entry] of this.connectionPool.entries()) {
      try {
        entry.connection.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
    this.connectionPool.clear();
    
    // 停止健康检查 (在实际应用中需要清理定时器)
    console.log(`ProxyIP ${this.proxyIP} 核心实例已销毁`);
  }
}