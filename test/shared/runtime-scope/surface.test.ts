import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  detectExecutionSurface,
  resolveLocalRegistryLocation,
} from "../../../src/shared/runtime-scope/index.js";

describe("runtime-scope execution surfaces", () => {
  test("classifies native Windows launched through WSL interop as Windows", () => {
    const surface = detectExecutionSurface({
      platform: "win32",
      installationRef: "windows-installation",
      wslDistribution: "Ubuntu-24.04",
      launchOrigin: "wsl-interop",
    });

    assert.equal(surface.nativePlatform, "win32");
    assert.equal(surface.kind, "windows-native");
    assert.equal(surface.launchOrigin, "wsl-interop");
    assert.equal(surface.wslDistribution, "Ubuntu-24.04");

    const location = resolveLocalRegistryLocation({
      executionSurface: surface,
      localAppDataDirectory: "C:\\Users\\Guff\\AppData\\Local",
      xdgStateDirectory: "/tmp/must-not-win",
    });

    assert.equal(location.source, "windows-local-app-data");
    assert.equal(location.registryPath, "C:\\Users\\Guff\\AppData\\Local\\Lex\\registry.db");
  });

  test("classifies WSL distributions and keeps their injected state roots separate", () => {
    const ubuntu = detectExecutionSurface({
      platform: "linux",
      installationRef: "wsl-ubuntu-installation",
      wslDistribution: "Ubuntu-24.04",
    });
    const debian = detectExecutionSurface({
      platform: "linux",
      installationRef: "wsl-debian-installation",
      wslDistribution: "Debian",
    });

    assert.equal(ubuntu.kind, "wsl");
    assert.equal(debian.kind, "wsl");
    assert.notEqual(ubuntu.evidenceDigest, debian.evidenceDigest);

    const ubuntuLocation = resolveLocalRegistryLocation({
      executionSurface: ubuntu,
      homeDirectory: "/home/guff",
      xdgStateDirectory: "/home/guff/.local/state",
    });
    const debianLocation = resolveLocalRegistryLocation({
      executionSurface: debian,
      homeDirectory: "/home/guff",
      xdgStateDirectory: "/home/guff/.debian/state",
    });

    assert.equal(ubuntuLocation.registryPath, "/home/guff/.local/state/lex/registry.db");
    assert.equal(debianLocation.registryPath, "/home/guff/.debian/state/lex/registry.db");
    assert.notEqual(ubuntuLocation.registryPath, debianLocation.registryPath);
  });

  test("keeps Windows launch provenance out of persistent surface identity", () => {
    const native = detectExecutionSurface({
      platform: "win32",
      installationRef: "windows-installation",
      launchOrigin: "native-shell",
    });
    const interop = detectExecutionSurface({
      platform: "win32",
      installationRef: "windows-installation",
      wslDistribution: "Ubuntu-24.04",
      launchOrigin: "wsl-interop",
    });

    assert.equal(native.evidenceDigest, interop.evidenceDigest);
    assert.notEqual(native.launchOrigin, interop.launchOrigin);
  });

  test("uses deterministic Linux and macOS fallbacks from explicit home directories", () => {
    const linux = detectExecutionSurface({
      platform: "linux",
      installationRef: "linux-installation",
    });
    const macos = detectExecutionSurface({
      platform: "darwin",
      installationRef: "macos-installation",
    });

    assert.deepEqual(
      resolveLocalRegistryLocation({
        executionSurface: linux,
        homeDirectory: "/home/guff",
      }),
      {
        schemaVersion: 1,
        registryPath: "/home/guff/.local/state/lex/registry.db",
        source: "linux-home-fallback",
      }
    );
    assert.deepEqual(
      resolveLocalRegistryLocation({
        executionSurface: macos,
        homeDirectory: "/Users/guff",
      }),
      {
        schemaVersion: 1,
        registryPath: "/Users/guff/Library/Application Support/Lex/registry.db",
        source: "macos-application-support",
      }
    );
  });

  test("surface evidence is deterministic and rejects missing captured paths", () => {
    const input = {
      platform: "linux" as const,
      installationRef: "stable-installation",
      wslDistribution: "Ubuntu-24.04",
      launchOrigin: "native-shell" as const,
    };

    assert.deepEqual(detectExecutionSurface(input), detectExecutionSurface(input));
    assert.throws(
      () =>
        resolveLocalRegistryLocation({
          executionSurface: detectExecutionSurface({
            platform: "win32",
            installationRef: "windows-installation",
          }),
          homeDirectory: "C:\\Users\\Guff",
        }),
      /localAppDataDirectory/
    );
  });

  test("rejects relative and cross-surface registry locations", () => {
    const windows = detectExecutionSurface({
      platform: "win32",
      installationRef: "windows-installation",
    });
    const wsl = detectExecutionSurface({
      platform: "linux",
      installationRef: "wsl-installation",
      wslDistribution: "Ubuntu-24.04",
    });

    assert.throws(
      () =>
        resolveLocalRegistryLocation({
          executionSurface: windows,
          localAppDataDirectory: "AppData\\Local",
        }),
      /absolute win32 path/
    );
    assert.throws(
      () =>
        resolveLocalRegistryLocation({
          executionSurface: windows,
          localAppDataDirectory: "\\\\wsl$\\Ubuntu-24.04\\home\\guff",
        }),
      /inside the Windows filesystem/
    );
    assert.throws(
      () =>
        resolveLocalRegistryLocation({
          executionSurface: wsl,
          xdgStateDirectory: "state",
        }),
      /absolute linux path/
    );
    assert.throws(
      () =>
        resolveLocalRegistryLocation({
          executionSurface: wsl,
          xdgStateDirectory: "/mnt/c/Users/Guff/AppData/Local/Lex",
        }),
      /inside the WSL filesystem/
    );
  });
});
