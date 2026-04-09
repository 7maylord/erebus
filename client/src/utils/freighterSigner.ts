/**
 * Wraps Freighter browser extension into the ClientStellarSigner interface
 * expected by @x402/stellar ExactStellarScheme.
 *
 * Interface required:
 *   { address: string, signAuthEntry: (xdrBase64: string) => Promise<string> }
 */

import {
  getPublicKey,
  signAuthEntry,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";

export type FreighterSigner = {
  address: string;
  signAuthEntry: (xdrBase64: string) => Promise<string>;
};

export async function connectFreighter(network: string): Promise<FreighterSigner> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    throw new Error("Freighter extension not found. Install it at freighter.app");
  }

  const access = await requestAccess();
  if (access.error) {
    throw new Error("Freighter access denied: " + access.error);
  }

  const pkResult = await getPublicKey();
  if (pkResult.error) {
    throw new Error("Could not get Freighter public key: " + pkResult.error);
  }

  const address = pkResult.address;

  return {
    address,
    signAuthEntry: async (xdrBase64: string) => {
      const result = await signAuthEntry(xdrBase64, { networkPassphrase: network });
      if (result.error) {
        throw new Error("Freighter signing failed: " + result.error);
      }
      return result.signedAuthEntry;
    },
  };
}
