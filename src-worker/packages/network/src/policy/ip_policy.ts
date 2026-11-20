const IPV4_TEXT_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_REGEX = /^[0-9a-f]{1,4}$/;

function parseIpv4Octets(ip: string): number[] | null {
  const match = IPV4_TEXT_REGEX.exec(ip);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
}

function isPrivateOrReservedIpv4Octets(octets: readonly number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function parseHexGroup(part: string): number | null {
  return IPV6_GROUP_REGEX.test(part) ? parseInt(part, 16) : null;
}

function parseIpv6Groups(ip: string): number[] | null {
  let norm = ip.toLowerCase();
  const lastColon = norm.lastIndexOf(":");
  if (lastColon === -1) return null;

  const tail = norm.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = parseIpv4Octets(tail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    norm = `${norm.slice(0, lastColon)}:${high}:${low}`;
  }

  const parts = norm.split("::");
  if (parts.length > 2) return null;

  if (parts.length === 1) {
    const raw = norm.split(":");
    if (raw.length !== 8) return null;
    const groups = raw.map(parseHexGroup);
    return groups.every((group): group is number => group !== null) ? groups : null;
  }

  const leftRaw = parts[0] ? parts[0].split(":") : [];
  const rightRaw = parts[1] ? parts[1].split(":") : [];
  const missing = 8 - leftRaw.length - rightRaw.length;
  if (missing < 1) return null;

  const left = leftRaw.map(parseHexGroup);
  const right = rightRaw.map(parseHexGroup);
  if (left.some((group) => group === null) || right.some((group) => group === null)) return null;

  return [...(left as number[]), ...new Array<number>(missing).fill(0), ...(right as number[])];
}

/** Reports whether a URL hostname or address string is a valid IPv4 or IPv6 literal. */
export function isIp(hostname: string): boolean {
  const trimmed = hostname.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseIpv6Groups(trimmed.slice(1, -1)) !== null;
  }
  if (trimmed.includes("[") || trimmed.includes("]")) return false;
  return parseIpv4Octets(trimmed) !== null || parseIpv6Groups(trimmed) !== null;
}

/** Conservative public-address check used by the coordinator and leased nodes. */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().replace(/^\[|\]$/g, "");
  if (!cleanIp || cleanIp === "localhost") return true;
  if (cleanIp.includes(".") && !cleanIp.includes(":")) {
    const octets = parseIpv4Octets(cleanIp);
    return octets === null || isPrivateOrReservedIpv4Octets(octets);
  }

  const groups = parseIpv6Groups(cleanIp);
  if (!groups) return true;

  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPrivateOrReservedIpv4Octets([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  if (groups.slice(0, 6).every((group) => group === 0) && !(groups[6] === 0 && groups[7] === 1)) {
    return isPrivateOrReservedIpv4Octets([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  const g0 = groups[0];
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && groups[1] === 0x0db8) return true;
  if (g0 === 0x0100 && (groups[1] & 0xff00) === 0) return true;
  return false;
}
