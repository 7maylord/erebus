import {
  getAddress,
  signAuthEntry,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";

export type FreighterSigner = {
  address: string;
  signAuthEntry: (
    xdrBase64: string,
    opts?: { networkPassphrase?: string; address?: string },
  ) => Promise<{ signedAuthEntry: string; signerAddress?: string }>;
};

export async function connectFreighter(
  network: string,
): Promise<FreighterSigner> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    throw new Error(
      "Freighter extension not found. Install it at freighter.app",
    );
  }

  const access = await requestAccess();
  if (access.error) {
    throw new Error("Freighter access denied: " + access.error);
  }

  const addrResult = await getAddress();
  if (addrResult.error) {
    throw new Error("Could not get Freighter address: " + addrResult.error);
  }

  const address = addrResult.address;

  return {
    address,
    signAuthEntry: async (xdrBase64: string) => {
      const result = await signAuthEntry(xdrBase64, {
        networkPassphrase: network,
      });
      if (result.error) {
        throw new Error("Freighter signing failed: " + result.error);
      }
      if (!result.signedAuthEntry) {
        throw new Error("Freighter returned empty signed auth entry");
      }
      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress,
      };
    },
  };
}
