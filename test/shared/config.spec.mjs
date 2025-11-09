import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resetConfig, getAppRoot } from "../../dist/shared/config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root (where package.json is)
function findProjectRoot() {
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
}

const projectRoot = findProjectRoot();
const configPath = path.join(projectRoot, ".lex.config.json");

describe("Config system", () => {
  let originalEnv = {};
  let configFileExisted = false;
  let originalConfigContent = "";

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      LEX_APP_ROOT: process.env.LEX_APP_ROOT,
      LEX_DB_PATH: process.env.LEX_DB_PATH,
      LEX_POLICY_PATH: process.env.LEX_POLICY_PATH,
    };

    // Save original config file if it exists
    if (fs.existsSync(configPath)) {
      configFileExisted = true;
      originalConfigContent = fs.readFileSync(configPath, "utf-8");
    }

    // Clear environment variables
    delete process.env.LEX_APP_ROOT;
    delete process.env.LEX_DB_PATH;
    delete process.env.LEX_POLICY_PATH;

    // Reset config cache
    resetConfig();
  });

  afterEach(() => {
    // Restore environment
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });

    // Restore or remove config file
    if (configFileExisted) {
      fs.writeFileSync(configPath, originalConfigContent, "utf-8");
    } else if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    // Reset config cache
    resetConfig();
  });

  describe("Default configuration", () => {
    it("should return default values when no config file or env vars", () => {
      const config = loadConfig();

      assert.ok(config.paths.appRoot, "appRoot should be set");
      assert.strictEqual(config.paths.database, path.join(config.paths.appRoot, "lex-memory.db"));
      assert.strictEqual(config.paths.policy, path.join(config.paths.appRoot, "lexmap.policy.json"));
    });

    it("should use process.cwd() as default appRoot", () => {
      const config = loadConfig();
      // appRoot should be project root (where package.json is)
      assert.ok(config.paths.appRoot.endsWith("lex") || config.paths.appRoot.includes("lex"));
    });
  });

  describe("Configuration file loading", () => {
    it("should load config from .lex.config.json", () => {
      const testConfig = {
        paths: {
          appRoot: "/test/app/root",
          database: "./test.db",
          policy: "./test-policy.json",
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), "utf-8");

      const config = loadConfig();

      assert.strictEqual(config.paths.appRoot, "/test/app/root");
      assert.strictEqual(config.paths.database, "/test/app/root/test.db");
      assert.strictEqual(config.paths.policy, "/test/app/root/test-policy.json");
    });

    it("should handle absolute paths in config file", () => {
      const testConfig = {
        paths: {
          appRoot: "/test/app/root",
          database: "/absolute/path/to/db.db",
          policy: "/absolute/path/to/policy.json",
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), "utf-8");

      const config = loadConfig();

      assert.strictEqual(config.paths.database, "/absolute/path/to/db.db");
      assert.strictEqual(config.paths.policy, "/absolute/path/to/policy.json");
    });

    it("should gracefully handle malformed config file", () => {
      fs.writeFileSync(configPath, "{ invalid json }", "utf-8");

      // Should not throw, should fall back to defaults
      const config = loadConfig();

      assert.ok(config.paths.appRoot);
      assert.ok(config.paths.database.includes("lex-memory.db"));
    });
  });

  describe("Environment variable overrides", () => {
    it("should override appRoot from LEX_APP_ROOT", () => {
      process.env.LEX_APP_ROOT = "/env/app/root";

      const config = loadConfig();

      assert.strictEqual(config.paths.appRoot, "/env/app/root");
    });

    it("should override database from LEX_DB_PATH", () => {
      process.env.LEX_APP_ROOT = "/env/root";
      process.env.LEX_DB_PATH = "./env.db";

      const config = loadConfig();

      assert.strictEqual(config.paths.database, "/env/root/env.db");
    });

    it("should override policy from LEX_POLICY_PATH", () => {
      process.env.LEX_APP_ROOT = "/env/root";
      process.env.LEX_POLICY_PATH = "./env-policy.json";

      const config = loadConfig();

      assert.strictEqual(config.paths.policy, "/env/root/env-policy.json");
    });

    it("should prioritize env vars over config file", () => {
      const testConfig = {
        paths: {
          appRoot: "/file/app/root",
          database: "./file.db",
          policy: "./file-policy.json",
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), "utf-8");

      process.env.LEX_APP_ROOT = "/env/app/root";
      process.env.LEX_DB_PATH = "/env/db.db";

      const config = loadConfig();

      // Env vars should win
      assert.strictEqual(config.paths.appRoot, "/env/app/root");
      assert.strictEqual(config.paths.database, "/env/db.db");
      // Policy not overridden, so should come from file
      assert.strictEqual(config.paths.policy, "/env/app/root/file-policy.json");
    });
  });

  describe("Configuration caching", () => {
    it("should cache config after first load", () => {
      const config1 = loadConfig();

      // Change env var (shouldn't affect cached config)
      process.env.LEX_APP_ROOT = "/different/root";

      const config2 = loadConfig();

      assert.strictEqual(config1.paths.appRoot, config2.paths.appRoot);
    });

    it("should reload config after resetConfig()", () => {
      const config1 = loadConfig();
      const originalRoot = config1.paths.appRoot;

      resetConfig();
      process.env.LEX_APP_ROOT = "/new/root";

      const config2 = loadConfig();

      assert.notStrictEqual(config2.paths.appRoot, originalRoot);
      assert.strictEqual(config2.paths.appRoot, "/new/root");
    });
  });

  describe("Convenience functions", () => {
    it("getAppRoot() should return app root from config", () => {
      process.env.LEX_APP_ROOT = "/convenience/root";

      const appRoot = getAppRoot();

      assert.strictEqual(appRoot, "/convenience/root");
    });

    it("getAppRoot() should match loadConfig().paths.appRoot", () => {
      const config = loadConfig();
      const appRoot = getAppRoot();

      assert.strictEqual(appRoot, config.paths.appRoot);
    });
  });

  describe("Path resolution", () => {
    it("should resolve relative database path against appRoot", () => {
      process.env.LEX_APP_ROOT = "/my/app";
      process.env.LEX_DB_PATH = "./data/memory.db";

      const config = loadConfig();

      assert.strictEqual(config.paths.database, "/my/app/data/memory.db");
    });

    it("should not modify absolute database path", () => {
      process.env.LEX_APP_ROOT = "/my/app";
      process.env.LEX_DB_PATH = "/var/lib/lex/memory.db";

      const config = loadConfig();

      assert.strictEqual(config.paths.database, "/var/lib/lex/memory.db");
    });

    it("should resolve relative policy path against appRoot", () => {
      process.env.LEX_APP_ROOT = "/my/app";
      process.env.LEX_POLICY_PATH = "./config/policy.json";

      const config = loadConfig();

      assert.strictEqual(config.paths.policy, "/my/app/config/policy.json");
    });

    it("should not modify absolute policy path", () => {
      process.env.LEX_APP_ROOT = "/my/app";
      process.env.LEX_POLICY_PATH = "/etc/lex/policy.json";

      const config = loadConfig();

      assert.strictEqual(config.paths.policy, "/etc/lex/policy.json");
    });
  });
});
