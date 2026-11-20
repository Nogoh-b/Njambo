import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { verifyAccessToken } from "./authTokens";

/* Construit la requête « callable » à partir du jeton d'accès maison
   (server/src/authTokens.ts). `auth.token` garde la forme lue par les
   commandes (`token.admin`), comme à l'époque de Firebase Auth. */
export async function buildCallableRequest(authorizationHeader: string | undefined, data: unknown): Promise<CallableRequest<unknown>> {
  const match = /^Bearer (.+)$/.exec(authorizationHeader ?? "");
  if (!match) return { data, rawRequest: undefined } as unknown as CallableRequest<unknown>;
  const idToken = match[1];
  const decoded = verifyAccessToken(idToken);
  if (!decoded) throw new HttpsError("unauthenticated", "INVALID_ID_TOKEN");
  return {
    data,
    auth: { uid: decoded.uid, token: decoded, rawToken: idToken },
    rawRequest: undefined,
  } as unknown as CallableRequest<unknown>;
}
