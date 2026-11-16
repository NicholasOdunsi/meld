"use server";

import { routeMainChatMessage } from "./star-route";

export async function routeMessageToStar(input: unknown) {
  return routeMainChatMessage(input);
}
