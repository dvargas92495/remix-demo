const AWS = require("aws-sdk");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const crypto = require("crypto");
const lambda = new AWS.Lambda();
const appPath = (p) => path.resolve(fs.realpathSync(process.cwd()), p);
const readDir = (s) =>
  fs.existsSync(s)
    ? fs
        .readdirSync(s, { withFileTypes: true })
        .flatMap((f) =>
          f.isDirectory() ? readDir(`${s}/${f.name}`) : [`${s}/${f.name}`]
        )
    : [];

const options = {
  date: new Date("09-24-1995"),
};

const deployWithRemix = () => {
  const zip = archiver("zip", { gzip: true, zlib: { level: 9 } });
  readDir("out").forEach((f) =>
    zip.file(appPath(f), { name: `origin-request.js`, ...options })
  );
  return new Promise((resolve) => {
    const shasum = crypto.createHash("sha256");
    const data = [];
    zip
      .on("data", (d) => {
        data.push(d);
        shasum.update(d);
      })
      .on("end", () => {
        const sha256 = shasum.digest("base64");
        resolve({ sha256, data });
      })
      .finalize();
  }).then(({ sha256, data }) =>
    lambda
      .getFunction({
        FunctionName: "remix-davidvargas-me_origin-request",
      })
      .promise()
      .then((l) => {
        if (sha256 === l.Configuration?.CodeSha256) {
          return `No need to upload ${FunctionName}, shas match.`;
        } else {
          return lambda
            .updateFunctionCode({
              FunctionName,
              Publish: true,
              ZipFile: Buffer.concat(data),
            })
            .promise()
            .then(
              (upd) =>
                `Succesfully uploaded ${FunctionName} at ${upd.LastModified}`
            );
        }
      })
      .then(console.log)
      .then(resolve)
      .catch((e) => {
        console.error(`deploy of ${functionName} failed:`);
        reject(e);
      })
  );
};

deployWithRemix();
