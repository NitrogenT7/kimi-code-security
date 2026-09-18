export interface EgressTarget {
  readonly scheme: string;
  readonly hostname: string;
  readonly port: string | undefined;
  readonly loopback: boolean;
}

const NETWORK_COMMANDS: ReadonlySet<string> = new Set([
  'curl',
  'wget',
  'http',
  'https',
  'httpie',
  'nc',
  'ncat',
  'netcat',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'telnet',
  'nslookup',
  'dig',
  'host',
  'ping',
  'traceroute',
  'tracert',
]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
]);

const URL_RE =
  /(?:https?|ftp|ssh|telnet):\/\/[^\s"'`<>()\\]+|(?<![a-zA-Z0-9.-])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|net|org|io|cn|com\.cn|net\.cn|org\.cn|gov|gov\.cn|edu|edu\.cn|dev|app|ai|me|co|info|biz|xyz|top|vip|site|online|tech|cc|tv|live)(?::\d{1,5})?(?:[/?#][^\s"'`<>()]*)?/g;

const IPV4_RE =
  /(?<![0-9])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?::\d{1,5})?/g;

export function extractEgressTarget(command: string): EgressTarget | undefined {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  const isNetworkCommand = NETWORK_COMMANDS.has(firstWord);

  const userHost = matchUserHost(trimmed);
  if (userHost !== undefined) return userHost;

  const urlMatch = trimmed.match(URL_RE);
  if (urlMatch !== null) {
    const parsed = parseUrlLike(urlMatch[0]);
    if (parsed !== undefined) return parsed;
  }

  if (!isNetworkCommand) {
    const ipMatch = trimmed.match(IPV4_RE);
    if (ipMatch !== null) {
      const hostPart = ipMatch[0].split(':')[0] ?? ipMatch[0];
      return {
        scheme: 'tcp',
        hostname: hostPart,
        port: ipMatch[0].includes(':') ? ipMatch[0].split(':')[1] : undefined,
        loopback: LOOPBACK_HOSTS.has(hostPart),
      };
    }
    return undefined;
  }

  const flagHost = matchFlagHost(trimmed);
  if (flagHost !== undefined) return flagHost;

  const bare = matchBareHost(trimmed);
  if (bare !== undefined) return bare;
  return undefined;
}

function parseUrlLike(raw: string): EgressTarget | undefined {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.replaceAll(/^\[|\]$/g, '');
    return {
      scheme: url.protocol.replace(':', ''),
      hostname,
      port: url.port.length > 0 ? url.port : undefined,
      loopback: LOOPBACK_HOSTS.has(hostname) || LOOPBACK_HOSTS.has(url.hostname),
    };
  } catch {
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#\s]+)/.exec(raw);
    if (schemeMatch === null) return undefined;
    const hostPart = schemeMatch[2] ?? '';
    const hostOnly = hostPart.split('/')[0] ?? hostPart;
    const portIdx = hostOnly.lastIndexOf(':');
    let hostname = hostOnly;
    let port: string | undefined;
    if (portIdx > 0 && !hostOnly.slice(portIdx).includes(']')) {
      hostname = hostOnly.slice(0, portIdx);
      port = hostOnly.slice(portIdx + 1);
    }
    hostname = hostname.replaceAll(/^\[|\]$/g, '');
    if (hostname.length === 0) return undefined;
    return {
      scheme: schemeMatch[1] ?? '',
      hostname,
      port,
      loopback: LOOPBACK_HOSTS.has(hostname),
    };
  }
}

function matchUserHost(command: string): EgressTarget | undefined {
  const re = /(?:^|\s)(?:[a-zA-Z0-9_.-]+)@((?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(?::(\d{1,5}))?(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    const hostname = m[1] ?? '';
    if (hostname.length === 0) continue;
    return {
      scheme: 'tcp',
      hostname,
      port: m[2],
      loopback: LOOPBACK_HOSTS.has(hostname),
    };
  }
  return undefined;
}

function matchFlagHost(command: string): EgressTarget | undefined {
  const flagRe = /(?:^|\s)--?(?:H|host|hostname|connect|url|u)\s*=?\s*([^\s"']+)/g;
  let m: RegExpExecArray | null;
  while ((m = flagRe.exec(command)) !== null) {
    const value = stripQuotes(m[1] ?? '');
    if (value.length === 0) continue;
    if (/^https?:\/\//.test(value)) {
      const parsed = parseUrlLike(value);
      if (parsed !== undefined) return parsed;
    }
    const hostPart = value.split('/')[0] ?? value;
    const portIdx = hostPart.lastIndexOf(':');
    let hostname = hostPart;
    let port: string | undefined;
    if (portIdx > 0) {
      hostname = hostPart.slice(0, portIdx);
      port = hostPart.slice(portIdx + 1);
    }
    hostname = hostname.replaceAll(/^\[|\]$/g, '');
    if (hostname.length === 0) continue;
    if (!/\./.test(hostname) && hostname !== 'localhost') continue;
    return {
      scheme: 'tcp',
      hostname,
      port,
      loopback: LOOPBACK_HOSTS.has(hostname) || LOOPBACK_HOSTS.has(hostPart),
    };
  }
  return undefined;
}

function matchBareHost(command: string): EgressTarget | undefined {
  const tokens = command.split(/\s+/).slice(1);
  for (const token of tokens) {
    const value = stripQuotes(token);
    if (value.length === 0 || value.startsWith('-')) continue;
    const hostPart = value.split(/[\\/]/)[0] ?? value;
    const portIdx = hostPart.lastIndexOf(':');
    let hostname = hostPart;
    let port: string | undefined;
    if (portIdx > 0 && !hostname.startsWith('[')) {
      hostname = hostPart.slice(0, portIdx);
      port = hostPart.slice(portIdx + 1);
    }
    hostname = hostname.replaceAll(/^\[|\]$/g, '');
    if (hostname.length === 0) continue;
    if (!/\./.test(hostname) && hostname !== 'localhost') continue;
    return {
      scheme: 'tcp',
      hostname,
      port,
      loopback: LOOPBACK_HOSTS.has(hostname),
    };
  }
  return undefined;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
