// =================================================================================
// BPB 配置生成器模块
// 基于 _workerbpb.js 分析，实现 BPB 风格的配置自动生成
// =================================================================================

/**
 * BPB 配置生成器
 * 负责为用户自动生成 BPB 相关的所有配置参数
 */
export class BPBConfigGenerator {
  constructor() {
    // BPB 核心配置 - 基于分析的 _workerbpb.js
    this.defaultProxyIP = "bpb.yousef.isegaro.com";
    this.fallbackDomain = "speed.cloudflare.com";
    
    // Cloudflare Pages 兼容端口 (基于 BPB 分析)
    this.supportedPorts = {
      tls: [443, 2053, 2083, 2087, 2096, 8443],
      plain: [80, 8080, 8880, 2052, 2082, 2086, 2095]
    };
  }

  /**
   * 为用户生成完整的 BPB 配置
   * @param {number} userId - 用户ID
   * @param {string} userUuid - 用户UUID (VLESS使用)
   * @param {string} domain - Pages 域名
   * @returns {Object} 完整的 BPB 配置对象
   */
  generateUserBPBConfig(userId, userUuid, domain) {
    const config = {
      // BPB 核心配置变量 (对应 _workerbpb.js 的环境变量)
      PROXY_IP: this.defaultProxyIP,
      FALLBACK: this.fallbackDomain,
      UUID: userUuid,
      TR_PASS: this.generateTrojanPassword(),
      SUB_PATH: this.generateSubPath(),
      
      // 扩展配置
      user_id: userId,
      domain: domain,
      supported_ports: this.supportedPorts,
      
      // 元数据
      created_at: new Date().toISOString(),
      version: "1.0.0",
      generator: "BPB-Integration-v1"
    };

    console.log(`生成 BPB 配置 - 用户ID: ${userId}, UUID: ${userUuid}, 域名: ${domain}`);
    return config;
  }

  /**
   * 生成安全的 Trojan 密码
   * 基于 BPB 的密码复杂度要求
   * @returns {string} 16位随机密码
   */
  generateTrojanPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // 确保密码包含各种字符类型
    const requirements = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // 大写字母
      'abcdefghijklmnopqrstuvwxyz', // 小写字母  
      '0123456789',                 // 数字
      '!@#$%^&*'                   // 特殊字符
    ];
    
    // 先确保每种类型至少有一个字符
    requirements.forEach(charSet => {
      password += charSet.charAt(Math.floor(Math.random() * charSet.length));
    });
    
    // 填充剩余位数
    for (let i = password.length; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // 打乱密码字符顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * 生成随机订阅路径
   * 基于 BPB 的路径生成策略，确保安全性和唯一性
   * @returns {string} Base64编码的随机路径
   */
  generateSubPath() {
    // 生成随机字符串
    const randomString = crypto.randomUUID() + Date.now().toString(36);
    
    // Base64 编码并清理特殊字符
    const base64Path = btoa(randomString)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 16);
    
    return base64Path;
  }

  /**
   * 生成 BPB 风格的 VLESS 节点
   * 基于 _workerbpb.js 的节点生成逻辑
   * @param {Object} config - BPB 配置对象
   * @param {number} port - 端口号
   * @returns {string} VLESS 节点链接
   */
  generateBPBVLESSNode(config, port = 443) {
    const nodeName = `BPB-${config.domain}-${port}`;
    
    // BPB 风格的 VLESS 配置 (基于分析的参数)
    const vlessConfig = {
      protocol: 'vless',
      uuid: config.UUID,
      server: config.domain,
      port: port,
      encryption: 'none',
      security: 'tls',
      sni: config.PROXY_IP,  // 关键：使用 ProxyIP 作为 SNI
      fp: 'randomized',      // 指纹随机化 (反检测)
      type: 'ws',
      host: config.PROXY_IP, // 关键：Host 头使用 ProxyIP
      path: '/?ed=2560',     // BPB 特有路径
      name: nodeName
    };

    // 构建 VLESS URL
    const params = new URLSearchParams({
      encryption: vlessConfig.encryption,
      security: vlessConfig.security,
      sni: vlessConfig.sni,
      fp: vlessConfig.fp,
      type: vlessConfig.type,
      host: vlessConfig.host,
      path: vlessConfig.path
    });

    return `vless://${vlessConfig.uuid}@${vlessConfig.server}:${vlessConfig.port}?${params.toString()}#${encodeURIComponent(vlessConfig.name)}`;
  }

  /**
   * 生成 BPB 风格的 Trojan 节点
   * @param {Object} config - BPB 配置对象
   * @param {number} port - 端口号
   * @returns {string} Trojan 节点链接
   */
  generateBPBTrojanNode(config, port = 443) {
    const nodeName = `BPB-Trojan-${config.domain}-${port}`;
    
    const trojanConfig = {
      protocol: 'trojan',
      password: config.TR_PASS,
      server: config.domain,
      port: port,
      type: 'ws',
      security: 'tls',
      path: '/',
      host: config.PROXY_IP,  // 关键：使用 ProxyIP
      sni: config.PROXY_IP,
      alpn: 'h2,http/1.1',
      fp: 'chrome',
      name: nodeName
    };

    const params = new URLSearchParams({
      type: trojanConfig.type,
      security: trojanConfig.security,
      path: trojanConfig.path,
      host: trojanConfig.host,
      sni: trojanConfig.sni,
      alpn: trojanConfig.alpn,
      fp: trojanConfig.fp
    });

    return `trojan://${trojanConfig.password}@${trojanConfig.server}:${trojanConfig.port}?${params.toString()}#${encodeURIComponent(trojanConfig.name)}`;
  }

  /**
   * 生成完整的 BPB 节点集合
   * 为所有支持的端口生成 VLESS 和 Trojan 节点
   * @param {Object} config - BPB 配置对象
   * @returns {Array} 节点数组
   */
  generateAllBPBNodes(config) {
    const nodes = [];
    
    // 为每个 TLS 端口生成节点
    this.supportedPorts.tls.forEach(port => {
      nodes.push({
        type: 'vless',
        port: port,
        url: this.generateBPBVLESSNode(config, port),
        name: `BPB-VLESS-${port}`
      });
      
      nodes.push({
        type: 'trojan', 
        port: port,
        url: this.generateBPBTrojanNode(config, port),
        name: `BPB-Trojan-${port}`
      });
    });

    console.log(`生成 BPB 节点集合: ${nodes.length} 个节点`);
    return nodes;
  }

  /**
   * 验证 BPB 配置的有效性
   * @param {Object} config - BPB 配置对象
   * @returns {Object} 验证结果
   */
  validateBPBConfig(config) {
    const errors = [];
    
    if (!config.UUID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.UUID)) {
      errors.push('UUID 格式无效');
    }
    
    if (!config.TR_PASS || config.TR_PASS.length < 8) {
      errors.push('Trojan 密码长度不足');
    }
    
    if (!config.SUB_PATH || config.SUB_PATH.length < 8) {
      errors.push('订阅路径长度不足');
    }
    
    if (!config.domain || !config.domain.includes('.')) {
      errors.push('域名格式无效');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 生成 BPB 订阅链接
   * @param {Object} config - BPB 配置对象
   * @returns {string} 订阅链接
   */
  generateBPBSubscriptionURL(config) {
    return `https://${config.domain}/${config.SUB_PATH}`;
  }
}