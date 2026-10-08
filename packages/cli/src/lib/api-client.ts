import { hc } from "hono/client";
import { localAgent, type AppType } from "./local-agent";

// Create a custom fetch that directly calls the in-process Hono app
const customFetch = async (input: any, init?: any) => {
  // hc() passes URLs starting with the base we provide below.
  // We can just construct a Request object and pass it to localAgent.fetch
  const req = new Request(input, init);
  return localAgent.fetch(req);
};

export const apiClient = hc<AppType>(
  "http://localhost", // Dummy base URL; the fetch handler will route internally
  { fetch: customFetch }
);
