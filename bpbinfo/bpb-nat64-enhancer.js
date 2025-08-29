// =================================================================================
// BPB NAT64 增强器模块
// 基于 BPB 分析，增强现有 NAT64 功能，集成 ProxyIP 和反检测机制
// =================================================================================

/**
 * BPB NAT64 增强器
 * 将 BPB 的 ProxyIP 机制和反检测策略集成到 NAT64 功能中
 */
export class BPBNat64Enhancer {
  constructor(bpbConfig) {
    this.bpbConfig = bpbConfig;
    this.proxyIP = bpbConfig.PROXY_IP; // bpb.yousef.isegaro.com
    this.fallback = bpbConfig.FALLBACK; // speed.cloudflare.com
    
    // BPB 优质 NAT64 前缀 (基于分析优化)
    this.nat64Prefixes = [
      "64:ff9b::", // Google Public NAT64 (首选)
      "2001:67c:2b0::", // TREX.CZ (欧洲优质)
      "2001:67c:27e4:1064::", // go6lab (欧洲优质)
      "2602:fc59:b0:64::", // 备用服务
    ];
    
    // BPB 反检测端口策略
    this.antiDetectionPorts = {
      primary: [443, 2053, 8443], // 主要端口
      secondary: [2083, 2087, 2096], // 备用端口
      fallback: [80, 8080, 8880] // 回退端口
    };
  }

  /**
   * 生成 BPB 增强的 NAT64 VLESS 节点
   * 集成 ProxyIP 和反检测机制
   * @param {string} uuid - 用户 UUID
   * @param {string} domain - Pages 域名
   * @param {number} port - 端口号
   * @returns {string} BPB 增强的 VLESS 节点链接
   */
  generateBPBEnhancedNAT64Node(uuid, domain, port = 443) {
    const nodeName = `BPB-NAT64-${domain}-${port}`;
    
    // BPB 风格的反检测参数
    const bpbParams = {
      encryption: 'none',
      security: 'tls',
      sni: this.proxyIP, // 关键：使用 ProxyIP 作为 SNI
      fp: 'randomized', // 指纹随机化 (BPB 反检测核心)
      type: 'ws',
      host: this.proxyIP, // 关键：Host 头使用 ProxyIP
      path: '/?ed=2560', // BPB 特有路径参数
      alpn: 'h2,http/1.1' // HTTP/2 优先
    };

    // 构建参数字符串
    const params = new URLSearchParams(bpbParams);
    
    return `vless://${uuid}@${domain}:${port}?${params.toString()}#${encodeURIComponent(nodeName)}`;
  }

  /**
   * 生成多端口 BPB NAT64 节点集合
   * @param {string} uuid - 用户 UUID
   * @param {string} domain - Pages 域名
   * @returns {Array} 节点数组
   */
  generateBPBNAT64NodeSet(uuid, domain) {
    const nodes = [];
    
    // 主要端口节点
    this.antiDetectionPorts.primary.forEach(port => {
      nodes.push({
        type: 'bpb-nat64-primary',
        port: port,
        url: this.generateBPBEnhancedNAT64Node(uuid, domain, port),
        name: `BPB-NAT64-Primary-${port}`,
        priority: 'high'
      });
    });
    
    // 备用端口节点
    this.antiDetectionPorts.secondary.forEach(port => {
      nodes.push({
        type: 'bpb-nat64-secondary',
        port: port,
        url: this.generateBPBEnhancedNAT64Node(uuid, domain, port),
        name: `BPB-NAT64-Secondary-${port}`,
        priority: 'medium'
      });
    });

    return nodes;
  }

  /**
   * BPB 增强的 IPv4 到 NAT64 IPv6 转换
   * 使用 BPB 的优质前缀和智能选择策略
   * @param {string} ipv4Address - IPv4 地址
   * @param {string} region - 客户端地区 (可选)
   * @returns {string} NAT64 IPv6 地址
   */
  convertToBPBNAT64IPv6(ipv4Address, region = 'global') {
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

    // BPB 智能前缀选择策略
    let chosenPrefix;
    if (region === 'CN' || region === 'Asia') {
      // 亚洲用户优先使用特定前缀
      chosenPrefix = this.nat64Prefixes[0]; // Google Public NAT64
    } else if (region === 'EU') {
      // 欧洲用户优先使用欧洲前缀
      chosenPrefix = this.nat64Prefixes[1]; // TREX.CZ
    } else {
      // 全球用户随机选择优质前缀
      chosenPrefix = this.nat64Prefixes[Math.floor(Math.random() * this.nat64Prefixes.length)];
    }

    return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
  }

  /**
   * BPB 增强的 IPv6 代理地址获取
   * 集成 ProxyIP 机制和故障转移
   * @param {string} domain - 目标域名
   * @param {string} clientRegion - 客户端地区
   * @returns {Promise<string>} IPv6 代理地址
   */
  async getBPBEnhancedIPv6ProxyAddress(domain, clientRegion = 'global') {
    try {
      // 首先尝试通过 ProxyIP 解析
      const proxyDnsQuery = await fetch(
        `https://1.1.1.1/dns-query?name=${domain}&type=A`,
        {
          headers: {
            Accept: "application/dns-json",
            'User-Agent': 'BPB-Enhanced-Client/1.0' // BPB 风格的 User-Agent
          },
        }
      );

      const dnsResult = await proxyDnsQuery.json();
      if (dnsResult.Answer && dnsResult.Answer.length > 0) {
        const aRecord = dnsResult.Answer.find((record) => record.type === 1);
        if (aRecord) {
          const ipv4Address = aRecord.data;
          return this.convertToBPBNAT64IPv6(ipv4Address, clientRegion);
        }
      }
      
      throw new Error("无法通过 ProxyIP 解析域名");
    } catch (primaryError) {
      console.log(`ProxyIP 解析失败: ${primaryError.message}, 尝试备用方案`);
      
      // 备用方案：直接 DNS 解析
      try {
        const fallbackQuery = await fetch(
          `https://8.8.8.8/resolve?name=${domain}&type=A`,
          {
            headers: {
              Accept: "application/dns-json",
            },
          }
        );
        
        const fallbackResult = await fallbackQuery.json();
        if (fallbackResult.Answer && fallbackResult.Answer.length > 0) {
          const aRecord = fallbackResult.Answer.find((record) => record.type === 1);
          if (aRecord) {
            const ipv4Address = aRecord.data;
            return this.convertToBPBNAT64IPv6(ipv4Address, clientRegion);
          }
        }
        
        throw new Error("备用 DNS 解析也失败");
      } catch (fallbackError) {
        throw new Error(`DNS解析完全失败: ${fallbackError.message}`);
      }
    }
  }

  /**
   * BPB 增强的连接建立函数
   * 集成 ProxyIP 中转和智能重试机制
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {string} clientRegion - 客户端地区
   * @returns {Promise<Object>} 连接对象
   */
  async establishBPBEnhancedConnection(targetHost, targetPort, clientRegion = 'global') {
    const log = (message) => console.log(`[BPB-NAT64] ${message}`);
    
    // 连接策略：ProxyIP -> NAT64 -> 直连
    const connectionStrategies = [
      {
        name: 'ProxyIP-Direct',
        handler: () => this.connectViaProxyIP(targetHost, targetPort)
      },
      {
        name: 'BPB-NAT64',
        handler: () => this.connectViaBPBNAT64(targetHost, targetPort, clientRegion)
      },
      {
        name: 'Fallback-Direct',
        handler: () => this.connectDirect(targetHost, targetPort)
      }
    ];

    for (const strategy of connectionStrategies) {
      try {
        log(`尝试 ${strategy.name} 连接到 ${targetHost}:${targetPort}`);
        const connection = await strategy.handler();
        log(`${strategy.name} 连接成功`);
        return connection;
      } catch (error) {
        log(`${strategy.name} 连接失败: ${error.message}`);
        continue;
      }
    }

    throw new Error(`所有连接策略都失败了`);
  }

  /**
   * 通过 ProxyIP 建立连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @returns {Promise<Object>} 连接对象
   */
  async connectViaProxyIP(targetHost, targetPort) {
    // 首先连接到 ProxyIP
    const proxyConnection = await connect({
      hostname: this.proxyIP,
      port: 443,
      secureTransport: "starttls"
    });

    // 通过 ProxyIP 建立到目标的隧道
    const connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                          `Host: ${targetHost}:${targetPort}\r\n` +
                          `User-Agent: BPB-Enhanced-Client/1.0\r\n` +
                          `Proxy-Connection: keep-alive\r\n\r\n`;

    const writer = proxyConnection.writable.getWriter();
    await writer.write(new TextEncoder().encode(connectRequest));
    writer.releaseLock();

    // 等待代理响应
    const reader = proxyConnection.readable.getReader();
    const { value } = await reader.read();
    const response = new TextDecoder().decode(value);
    reader.releaseLock();

    if (response.includes("200 Connection established")) {
      return proxyConnection;
    } else {
      throw new Error("ProxyIP 连接建立失败");
    }
  }

  /**
   * 通过 BPB NAT64 建立连接
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @param {string} clientRegion - 客户端地区
   * @returns {Promise<Object>} 连接对象
   */
  async connectViaBPBNAT64(targetHost, targetPort, clientRegion) {
    const nat64Address = await this.getBPBEnhancedIPv6ProxyAddress(targetHost, clientRegion);
    
    return await connect({
      hostname: nat64Address,
      port: targetPort,
    });
  }

  /**
   * 直连方式 (备用)
   * @param {string} targetHost - 目标主机
   * @param {number} targetPort - 目标端口
   * @returns {Promise<Object>} 连接对象
   */
  async connectDirect(targetHost, targetPort) {
    return await connect({
      hostname: targetHost,
      port: targetPort,
    });
  }

  /**
   * 检测客户端地区
   * @param {string} clientIP - 客户端 IP
   * @returns {string} 地区代码
   */
  detectClientRegion(clientIP) {
    // 简化的地区检测逻辑
    if (!clientIP) return 'global';
    
    // 中国 IP 段检测
    if (clientIP.startsWith('1.') || clientIP.startsWith('14.') || 
        clientIP.startsWith('27.') || clientIP.startsWith('36.') ||
        clientIP.startsWith('39.') || clientIP.startsWith('42.') ||
        clientIP.startsWith('58.') || clientIP.startsWith('59.') ||
        clientIP.startsWith('60.') || clientIP.startsWith('61.')) {
      return 'CN';
    }
    
    // 欧洲 IP 段检测 (简化)
    if (clientIP.startsWith('2.') || clientIP.startsWith('5.') ||
        clientIP.startsWith('31.') || clientIP.startsWith('37.') ||
        clientIP.startsWith('46.') || clientIP.startsWith('62.') ||
        clientIP.startsWith('77.') || clientIP.startsWith('78.') ||
        clientIP.startsWith('79.') || clientIP.startsWith('80.') ||
        clientIP.startsWith('81.') || clientIP.startsWith('82.') ||
        clientIP.startsWith('83.') || clientIP.startsWith('84.') ||
        clientIP.startsWith('85.') || clientIP.startsWith('86.') ||
        clientIP.startsWith('87.') || clientIP.startsWith('88.') ||
        clientIP.startsWith('89.') || clientIP.startsWith('90.') ||
        clientIP.startsWith('91.') || clientIP.startsWith('92.') ||
        clientIP.startsWith('93.') || clientIP.startsWith('94.') ||
        clientIP.startsWith('95.')) {
      return 'EU';
    }
    
    return 'global';
  }

  /**
   * 生成 BPB 增强的源节点配置
   * @param {string} uuid - 用户 UUID
   * @param {string} domain - Pages 域名
   * @returns {Object} 源节点配置对象
   */
  generateBPBNAT64SourceConfig(uuid, domain) {
    return {
      config_name: "BPB NAT64 增强节点",
      node_type: "nat64",
      config_data: {
        uuid: uuid,
        domain: domain,
        proxyIP: this.proxyIP,
        fallback: this.fallback,
        bpb_enhanced: true,
        anti_detection: true,
        nat64_prefixes: this.nat64Prefixes,
        supported_ports: this.antiDetectionPorts
      },
      generated_nodes: this.generateBPBNAT64NodeSet(uuid, domain),
      is_default: false,
      enabled: true,
      priority: 'high'
    };
  }
}