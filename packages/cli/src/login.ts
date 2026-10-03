import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import { api, ApiError } from "./api";
import { baseUrl, credentialsPath, loadCredentials, saveCredentials } from "./config";

interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openBrowser(url: string) {
  const [cmd, args] = platform() === "darwin" ? ["open", [url]] : platform() === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd as string, args as string[], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // no browser available: the URL is printed anyway
  }
}

export async function login(opts: { browser: boolean }) {
  const base = baseUrl(await loadCredentials());
  const device = await api<DeviceStart>(base, "/api/cli/device", {
    body: { client_name: `${hostname().replace(/\.local$/, "")} (${platform()})` },
  });

  console.log(`\nTo connect this computer, open:\n\n  ${device.verification_uri}\n\nand check that it shows this code:\n\n  ${device.user_code}\n`);
  if (opts.browser) openBrowser(device.verification_uri_complete);
  console.log("Waiting for approval in the browser… (Ctrl+C to cancel)");

  const deadline = Date.now() + device.expires_in * 1000;
  let warnedTokens = false;
  while (Date.now() < deadline) {
    await sleep(device.interval * 1000);
    try {
      const r = await api<{ token: string; username: string }>(base, "/api/cli/token", { body: { device_code: device.device_code } });
      await saveCredentials({ url: base, token: r.token, username: r.username });
      console.log(`\n✓ Signed in as @${r.username}. Credentials saved to ${credentialsPath()} (readable by you only).`);
      return;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.code === "authorization_pending" || e.code === "slow_down") continue;
      if (e.code === "too_many_tokens") {
        if (!warnedTokens) console.log(`\n${e.message}`);
        warnedTokens = true;
        continue;
      }
      if (e.code === "expired_token") throw new Error("The code expired or was already used. Run `setuptier login` again.");
      throw e;
    }
  }
  throw new Error("Timed out waiting for approval. Run `setuptier login` again.");
}
