import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { SupportedProvider } from "@mastercode/shared";
import { PROVIDER_INFO } from "@mastercode/shared";

export interface ProviderKey {
  provider: SupportedProvider;
  key: string;
  label?: string;
  addedAt: string;
  isDefault: boolean;
}

export interface StoredKeyInfo {
  provider: SupportedProvider;
  name: string;
  isConfigured: boolean;
  maskedKey?: string;
  label?: string;
  addedAt?: string;
  isDefault: boolean;
  isActive: boolean;
}

interface KeyStoreData {
  activeProvider: SupportedProvider | null;
  keys: Partial<Record<SupportedProvider, ProviderKey>>;
}

const CONFIG_DIR = path.join(os.homedir(), ".mastercode");
const LEGACY_CONFIG_DIR = path.join(os.homedir(), ".nightcode");
const KEYS_FILE = path.join(CONFIG_DIR, "keys.json");
const SALT_FILE = path.join(CONFIG_DIR, ".salt");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    // Migrate legacy config files if present
    if (fs.existsSync(LEGACY_CONFIG_DIR)) {
      const legacySalt = path.join(LEGACY_CONFIG_DIR, ".salt");
      const legacyKeys = path.join(LEGACY_CONFIG_DIR, "keys.json");
      const legacyPrefs = path.join(LEGACY_CONFIG_DIR, "preferences.json");
      if (fs.existsSync(legacySalt) && !fs.existsSync(SALT_FILE)) {
        try { fs.copyFileSync(legacySalt, SALT_FILE); } catch {}
      }
      if (fs.existsSync(legacyKeys) && !fs.existsSync(KEYS_FILE)) {
        try { fs.copyFileSync(legacyKeys, KEYS_FILE); } catch {}
      }
      const prefsFile = path.join(CONFIG_DIR, "preferences.json");
      if (fs.existsSync(legacyPrefs) && !fs.existsSync(prefsFile)) {
        try { fs.copyFileSync(legacyPrefs, prefsFile); } catch {}
      }
    }
  }
}

function getSalt(): Buffer {
  ensureConfigDir();
  if (fs.existsSync(SALT_FILE)) {
    try {
      return fs.readFileSync(SALT_FILE);
    } catch {
      // Fall back if unreadable
    }
  }

  const salt = crypto.randomBytes(16);
  try {
    fs.writeFileSync(SALT_FILE, salt);
  } catch {
    // Non-fatal if disk write fails
  }
  return salt;
}

function deriveEncryptionKey(legacy = false): Buffer {
  const salt = getSalt();
  const suffix = legacy ? "nightcode-byok" : "mastercode-byok";
  const machineSeed = `${os.hostname()}-${os.userInfo().username}-${suffix}`;
  return crypto.scryptSync(machineSeed, salt, 32);
}

function encrypt(text: string): { iv: string; tag: string; data: string } {
  const key = deriveEncryptionKey(false);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted,
  };
}

function decryptWithKey(
  payload: { iv: string; tag: string; data: string },
  key: Buffer,
): string {
  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(payload.data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function decrypt(payload: { iv: string; tag: string; data: string }): string {
  try {
    return decryptWithKey(payload, deriveEncryptionKey(false));
  } catch {
    // Fall back to legacy seed in case keys were saved under ~/.nightcode
    return decryptWithKey(payload, deriveEncryptionKey(true));
  }
}

function readStore(): KeyStoreData {
  ensureConfigDir();
  if (!fs.existsSync(KEYS_FILE)) {
    return { activeProvider: null, keys: {} };
  }

  try {
    const raw = fs.readFileSync(KEYS_FILE, "utf8");
    if (!raw.trim()) {
      return { activeProvider: null, keys: {} };
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed && "iv" in parsed && "tag" in parsed) {
      const decryptedText = decrypt(parsed);
      return JSON.parse(decryptedText);
    }

    // Unencrypted legacy/fallback
    if (parsed && typeof parsed === "object" && "keys" in parsed) {
      return parsed;
    }

    return { activeProvider: null, keys: {} };
  } catch {
    return { activeProvider: null, keys: {} };
  }
}

function writeStore(data: KeyStoreData) {
  ensureConfigDir();
  const serialized = JSON.stringify(data, null, 2);
  try {
    const encrypted = encrypt(serialized);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(encrypted, null, 2), "utf8");
  } catch {
    // If encryption fails for any platform reason, save as JSON
    fs.writeFileSync(KEYS_FILE, serialized, "utf8");
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }

  const commonPrefixes = ["sk-ant-", "sk-proj-", "sk-or-", "gsk_", "AIza"];
  for (const prefix of commonPrefixes) {
    if (trimmed.startsWith(prefix)) {
      const suffix = trimmed.slice(-4);
      return `${prefix}••••${suffix}`;
    }
  }

  if (trimmed.startsWith("sk-")) {
    const suffix = trimmed.slice(-4);
    return `sk-••••${suffix}`;
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function saveKey(
  provider: SupportedProvider,
  key: string,
  label?: string
): ProviderKey {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error("Key cannot be empty");
  }

  const store = readStore();
  const existing = store.keys[provider];
  const isDefault = existing?.isDefault ?? Object.keys(store.keys).length === 0;

  const providerKey: ProviderKey = {
    provider,
    key: trimmedKey,
    label: label?.trim() || existing?.label,
    addedAt: new Date().toISOString(),
    isDefault,
  };

  store.keys[provider] = providerKey;

  if (!store.activeProvider || isDefault) {
    store.activeProvider = provider;
  }

  writeStore(store);
  return providerKey;
}

export function getKey(provider: SupportedProvider): string | null {
  const store = readStore();
  return store.keys[provider]?.key ?? null;
}

export function deleteKey(provider: SupportedProvider): boolean {
  const store = readStore();
  if (!store.keys[provider]) {
    return false;
  }

  delete store.keys[provider];

  if (store.activeProvider === provider) {
    const remainingProviders = Object.keys(store.keys) as SupportedProvider[];
    store.activeProvider = remainingProviders[0] ?? null;
  }

  writeStore(store);
  return true;
}

export function getActiveProvider(): SupportedProvider | null {
  const store = readStore();
  if (store.activeProvider && store.keys[store.activeProvider]) {
    return store.activeProvider;
  }

  const configured = Object.keys(store.keys) as SupportedProvider[];
  return configured[0] ?? null;
}

export function setActiveProvider(provider: SupportedProvider): boolean {
  const store = readStore();
  if (!store.keys[provider]) {
    return false;
  }

  store.activeProvider = provider;
  writeStore(store);
  return true;
}

export function hasAnyKey(): boolean {
  const store = readStore();
  return Object.keys(store.keys).length > 0;
}

export function getConfiguredProviders(): SupportedProvider[] {
  const store = readStore();
  return Object.keys(store.keys) as SupportedProvider[];
}

export function listKeys(): StoredKeyInfo[] {
  const store = readStore();
  const active = getActiveProvider();
  const providers: SupportedProvider[] = [
    "anthropic",
    "openai",
    "gemini",
    "groq",
    "openrouter",
    "deepseek",
  ];

  return providers.map((provider) => {
    const keyData = store.keys[provider];
    const info = PROVIDER_INFO[provider];

    return {
      provider,
      name: info?.name ?? provider,
      isConfigured: Boolean(keyData?.key),
      maskedKey: keyData?.key ? maskKey(keyData.key) : undefined,
      label: keyData?.label,
      addedAt: keyData?.addedAt,
      isDefault: keyData?.isDefault ?? false,
      isActive: provider === active,
    };
  });
}
