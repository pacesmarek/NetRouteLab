/** Čistá logika IPv4 adresace – bez závislosti na UI. */

export interface ValidIface {
  valid: true;
  ipStr: string;
  ipLong: number;
  prefix: number;
  maskLong: number;
  maskStr: string;
  networkLong: number;
  networkStr: string;
  broadcastLong: number;
  broadcastStr: string;
  isNetworkAddress: boolean;
  isBroadcastAddress: boolean;
  isHostUsable: boolean;
}
export type Iface = ValidIface | { valid: false };

export interface MaskInfo {
  prefix: number;
  maskLong: number;
  maskStr: string;
}

/** "192.168.1.1" -> 32bitové číslo, nebo null při neplatném formátu. */
export function ipToLong(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null; // zákaz úvodních nul
    const n = Number(part);
    if (n > 255) return null;
    result = result * 256 + n;
  }
  return result;
}

export function longToIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

export function prefixToMaskLong(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMaskStr(prefix: number): string {
  return longToIp(prefixToMaskLong(prefix));
}

/**
 * Zparsuje masku. Standardně jen dekadicky (255.255.255.0);
 * lomený zápis ("/24" nebo "24") jen pokud je povolen (pokročilá funkce).
 */
export function parseSubnetMask(input: string, allowCidr: boolean): MaskInfo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/') || /^\d{1,2}$/.test(trimmed)) {
    if (!allowCidr) return null;
    const raw = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    if (!/^\d+$/.test(raw)) return null;
    const prefix = Number(raw);
    if (prefix < 1 || prefix > 30) return null;
    return { prefix, maskLong: prefixToMaskLong(prefix), maskStr: prefixToMaskStr(prefix) };
  }

  const maskLong = ipToLong(trimmed);
  if (maskLong === null) return null;

  let prefix = 0;
  let seenZero = false;
  for (let bit = 31; bit >= 0; bit--) {
    if (((maskLong >>> bit) & 1) === 1) {
      if (seenZero) return null; // nesouvislá maska
      prefix++;
    } else {
      seenZero = true;
    }
  }
  if (prefix < 1 || prefix > 30) return null;
  return { prefix, maskLong, maskStr: longToIp(maskLong) };
}

export function analyzeInterface(ip: string, mask: string, allowCidr: boolean): Iface {
  const ipLong = ipToLong(ip);
  const m = parseSubnetMask(mask, allowCidr);
  if (ipLong === null || m === null) return { valid: false };

  const networkLong = (ipLong & m.maskLong) >>> 0;
  const broadcastLong = (networkLong | (~m.maskLong >>> 0)) >>> 0;
  const isNetworkAddress = ipLong === networkLong;
  const isBroadcastAddress = ipLong === broadcastLong;
  return {
    valid: true,
    ipStr: longToIp(ipLong),
    ipLong,
    prefix: m.prefix,
    maskLong: m.maskLong,
    maskStr: m.maskStr,
    networkLong,
    networkStr: longToIp(networkLong),
    broadcastLong,
    broadcastStr: longToIp(broadcastLong),
    isNetworkAddress,
    isBroadcastAddress,
    isHostUsable: !isNetworkAddress && !isBroadcastAddress,
  };
}

export function isSameSubnet(a: Iface, b: Iface): boolean {
  if (!a.valid || !b.valid) return false;
  return a.networkLong === b.networkLong && a.prefix === b.prefix;
}

export function isIpInSubnet(ip: string, iface: Iface): boolean {
  if (!iface.valid) return false;
  const target = ipToLong(ip);
  if (target === null) return false;
  return ((target & iface.maskLong) >>> 0) === iface.networkLong;
}

export function subnetsOverlap(a: Iface, b: Iface): boolean {
  if (!a.valid || !b.valid) return false;
  return a.networkLong <= b.broadcastLong && b.networkLong <= a.broadcastLong;
}
