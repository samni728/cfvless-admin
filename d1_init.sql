-- 创建表（如果不存在）
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    user_uuid TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS subscription_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetch_status TEXT DEFAULT 'pending',
    node_count INTEGER DEFAULT 0,
    last_fetch_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS node_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_id INTEGER,
    node_url TEXT NOT NULL,
    node_hash TEXT,
    status TEXT DEFAULT 'untested',
    last_test_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES subscription_sources (id) ON DELETE CASCADE,
    UNIQUE(user_id, node_hash)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    node_data_base64 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tag_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tag_uuid TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, tag_name)
);

CREATE TABLE IF NOT EXISTS node_tag_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES node_pool (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE(node_id, tag_id)
);

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
);



-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(user_uuid);
CREATE INDEX IF NOT EXISTS idx_subscription_sources_user_id ON subscription_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_sources_status ON subscription_sources(fetch_status);
CREATE INDEX IF NOT EXISTS idx_node_pool_user_id ON node_pool(user_id);
CREATE INDEX IF NOT EXISTS idx_node_pool_source_id ON node_pool(source_id);
CREATE INDEX IF NOT EXISTS idx_node_pool_status ON node_pool(status);
CREATE INDEX IF NOT EXISTS idx_node_pool_hash ON node_pool(node_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_uuid ON subscriptions(uuid);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_uuid ON tags(tag_uuid);
CREATE INDEX IF NOT EXISTS idx_node_tag_map_node_id ON node_tag_map(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tag_map_tag_id ON node_tag_map(tag_id);
CREATE INDEX IF NOT EXISTS idx_source_node_configs_user_id ON source_node_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_source_node_configs_type ON source_node_configs(node_type);
CREATE INDEX IF NOT EXISTS idx_source_node_configs_default ON source_node_configs(is_default);

如果还没有成功 在运行这个
-- 订阅源表
CREATE TABLE subscription_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetch_status TEXT DEFAULT 'pending',
    node_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);