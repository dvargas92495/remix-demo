const AWS = require("aws-sdk");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const crypto = require("crypto");
const mime = require("mime-types");
const lambda = new AWS.Lambda();
const s3 = new AWS.S3();
const appPath = (p) => path.resolve(fs.realpathSync(process.cwd()), p);
const readDir = (s) =>
  fs.existsSync(s)
    ? fs
        .readdirSync(s, { withFileTypes: true })
        .flatMap((f) =>
          f.isDirectory() ? readDir(`${s}/${f.name}`) : [`${s}/${f.name}`]
        )
    : [];
const FE_OUT_DIR = path.join(process.env.FE_DIR_PREFIX || "", "public");

const options = {
  date: new Date("09-24-1995"),
};

const deployWithRemix = ({ keys, domain = "remix.davidvargas.me" } = {}) => {
  const FunctionName = "remix-davidvargas-me_origin-request";
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
        FunctionName,
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
                `Succesfully uploaded ${FunctionName} V${upd.Version} (${upd.FunctionArn}) at ${upd.LastModified}`
            );
        }
      })
      .then(console.log)
      .then(() =>
        Promise.all(
          (keys
            ? keys.filter((k) => fs.existsSync(k))
            : readDir(FE_OUT_DIR)
          ).map((p) => {
            const Key = `build/${p.substring(FE_OUT_DIR.length + 1)}`;
            const uploadProps = {
              Bucket: domain,
              ContentType: mime.lookup(Key) || undefined,
            };
            console.log(`Uploading ${p} to ${Key}...`);
            return s3
              .upload({
                Key,
                ...uploadProps,
                Body: fs.createReadStream(p),
              })
              .promise();
          })
        )
      )
      .catch((e) => {
        console.error(`deploy failed:`);
        console.error(e);
        process.exit(1);
      })
  );
};

deployWithRemix();
