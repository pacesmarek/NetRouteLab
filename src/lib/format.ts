import { prefixToMaskStr } from './net';

/** Maska jako text, který lze i zadat do pole: "255.255.255.0" nebo (v pokročilém režimu) "/24". */
export function fmtMask(prefix: number, cidr: boolean): string {
  return cidr ? `/${prefix}` : prefixToMaskStr(prefix);
}

/** Adresa + maska do textů: "10.0.0.1 (maska 255.255.255.0)" nebo "10.0.0.1/24". */
export function ipMask(addr: string, prefix: number, cidr: boolean): string {
  return cidr ? `${addr}/${prefix}` : `${addr} (maska ${prefixToMaskStr(prefix)})`;
}

export type MaskFormatter = (addr: string, prefix: number) => string;
