import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";

export async function buildCallableRequest(authorizationHeader: string | undefined, data: unknown): Promise<CallableRequest<unknown>> {
  const match = /^Bearer (.+)$/.exec(authorizationHeader ?? "");
  if (!match) return { data, rawRequest: undefined } as unknown as CallableRequest<unknown>;
  const idToken = match[1];
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      data,
      auth: { uid: decoded.uid, token: decoded, rawToken: idToken },
      rawRequest: undefined,
    } as unknown as CallableRequest<unknown>;
  } catch {
    throw new HttpsError("unauthenticated", "INVALID_ID_TOKEN");
  }
}
