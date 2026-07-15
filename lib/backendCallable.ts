import { callBackend } from "@/lib/backend";

/** Adapte les commandes HTTP du VPS à l'ancienne forme d'appel callable. */
export function backendCallable<
  RequestData extends Record<string, unknown> = Record<string, unknown>,
  ResponseData = unknown,
>(name: string) {
  return (payload: RequestData) => callBackend<ResponseData>(name, payload);
}
