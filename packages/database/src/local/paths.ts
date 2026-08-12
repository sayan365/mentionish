import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export interface LocalDataPathOptions {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

export interface LocalDataPaths {
  dataDirectory: string;
  databasePath: string;
  backupsDirectory: string;
}

function pathApiFor(platform: NodeJS.Platform): typeof posix {
  return platform === "win32" ? win32 : posix;
}

function requiredHome(value: string, pathApi: typeof posix): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "A home directory is required to resolve local data paths.",
    );
  }
  return pathApi.resolve(trimmed);
}

export function resolveLocalDataPaths(
  options: LocalDataPathOptions = {},
): LocalDataPaths {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathApi = pathApiFor(platform);
  const home = requiredHome(options.homeDirectory ?? homedir(), pathApi);
  const override = environment.MENTIONISH_DATA_DIR?.trim();

  let dataDirectory: string;
  if (override) {
    dataDirectory = pathApi.isAbsolute(override)
      ? override
      : pathApi.resolve(override);
  } else if (platform === "win32") {
    const windowsBase =
      environment.LOCALAPPDATA?.trim() ||
      environment.APPDATA?.trim() ||
      pathApi.join(home, "AppData", "Local");
    dataDirectory = pathApi.join(windowsBase, "Mentionish");
  } else if (platform === "darwin") {
    dataDirectory = pathApi.join(
      home,
      "Library",
      "Application Support",
      "Mentionish",
    );
  } else {
    const xdgDataHome = environment.XDG_DATA_HOME?.trim();
    dataDirectory = pathApi.join(
      xdgDataHome || pathApi.join(home, ".local", "share"),
      "mentionish",
    );
  }

  const absoluteDataDirectory = pathApi.resolve(dataDirectory);
  return {
    dataDirectory: absoluteDataDirectory,
    databasePath: pathApi.join(absoluteDataDirectory, "mentionish.sqlite3"),
    backupsDirectory: pathApi.join(absoluteDataDirectory, "backups"),
  };
}

export function ensureLocalDataDirectories(paths: LocalDataPaths): void {
  mkdirSync(paths.dataDirectory, { recursive: true });
  mkdirSync(paths.backupsDirectory, { recursive: true });
}
