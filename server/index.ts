import { createRequestHandler } from "@dvargas92495/remix-lambda-at-edge";

export const handler = createRequestHandler({
  build: require("./build"),
  originPaths: ["favicon.ico", /\/build\/.*/],
});
