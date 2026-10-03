import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  url: string;
  token: string;
  username: string;
}

export const DEFAULT_URL = "https://setuptier.com";
const dir = () => process.env.SETUPTIER_CONFIG_DIR ?? join(homedir(), ".config", "setuptier");
const file = () => join(dir(), "credentials.json");

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const c = JSON.parse(await readFile(file(), "utf8")) as Partial<Credentials>;
    return c.token && c.url ? { url: c.url, token: c.token, username: c.username ?? "" } : null;
  } catch {
    return null;
  }
}

/** Stored readable by the current user only (0600), like an SSH key. */
export async function saveCredentials(c: Credentials) {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(file(), JSON.stringify(c, null, 2), { mode: 0o600 });
  await chmod(file(), 0o600);
}

export async function clearCredentials() {
  await rm(file(), { force: true });
}

export const credentialsPath = file;
export const configDir = dir;
export const baseUrl = (c?: Credentials | null) => (process.env.SETUPTIER_URL ?? c?.url ?? DEFAULT_URL).replace(/\/$/, "");
