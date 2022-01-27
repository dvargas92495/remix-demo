const remixBuild = require("@remix-run/dev/cli/commands").build;
const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild").build;
const appPath = (p) => path.resolve(fs.realpathSync(process.cwd()), p);

const buildWithRemix = ({ readable = false } = {}) => {
  const fuegoRemixConfig =
    JSON.parse(fs.readFileSync(appPath("package.json")).toString())?.fuego
      ?.remixConfig || {};
  const remixConfigFile = appPath("remix.config.js");
  const existingRemixConfig = fs.existsSync(remixConfigFile)
    ? require(remixConfigFile)
    : {};
  const newRemixConfig = {
    ...existingRemixConfig,
    serverBuildDirectory: "server/build",
    ...fuegoRemixConfig,
  };
  fs.writeFileSync(
    remixConfigFile,
    `/**
 * @type {import('@remix-run/dev/config').AppConfig}
 */
module.exports = ${JSON.stringify(newRemixConfig, null, 4)};`
  );
  return remixBuild(process.cwd(), process.env.NODE_ENV)
    .then(() =>
      esbuild({
        bundle: true,
        outdir: "out",
        platform: "node",
        target: "node14",
        entryPoints: ["server/index.ts"],
        minify: !readable,
      })
    )
    .then(() => 0);
};

buildWithRemix({ readable: true });
