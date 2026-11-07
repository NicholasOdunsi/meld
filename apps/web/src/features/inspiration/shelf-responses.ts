import { SHELF_ERROR_MESSAGES, type ShelfErrorBody, type ShelfErrorCode } from "@meld/contracts";

export const SHELF_ERROR_STATUS: Record<ShelfErrorCode, number> = {
  unauthorized: 401,
  invalid_code: 400,
  rate_limited: 429,
  unsupported_type: 415,
  too_large: 413,
  invalid_image: 422,
  unavailable: 503,
};

export function shelfError(code: ShelfErrorCode): Response {
  const body: ShelfErrorBody = { error: { code, message: SHELF_ERROR_MESSAGES[code] } };
  return Response.json(body, { status: SHELF_ERROR_STATUS[code] });
}
