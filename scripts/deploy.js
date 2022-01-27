const AWS = require("aws-sdk");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const crypto = require("crypto");
const mime = require("mime-types");
const lambda = new AWS.Lambda();
const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();

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

const FunctionName = "remix-davidvargas-me_origin-request";

const waitForLambda = ({ trial = 0, Qualifier }) => {
  return lambda
    .getFunction({ FunctionName, Qualifier })
    .promise()
    .then((r) => r.Configuration.State)
    .then((status) => {
      if (status === "Active") {
        return "Done, Lambda is Active!";
      } else if (trial === 60) {
        return "Ran out of time waiting for lambda...";
      } else {
        console.log(
          `Lambda had state ${status} on trial ${trial}. Trying again...`
        );
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(waitForLambda({ trial: trial + 1, Qualifier })),
            6000
          )
        );
      }
    });
};

const waitForCloudfront = (trial = 0) => {
  return cloudfront
    .getDistribution({ Id: process.env.CLOUDFRONT_DISTRIBUTION_ID })
    .promise()
    .then((r) => r.Distribution.Status)
    .then((status) => {
      if (status === "Enabled") {
        return "Done, Cloudfront is Enabled!";
      } else if (trial === 60) {
        return "Ran out of time waiting for cloudfront...";
      } else {
        console.log(
          `Distribution had status ${status} on trial ${trial}. Trying again...`
        );
        return new Promise((resolve) =>
          setTimeout(() => resolve(waitForCloudfront(trial + 1)), 1000)
        );
      }
    });
};

const deployWithRemix = ({ keys, domain = "remix.davidvargas.me" } = {}) => {
  return Promise.all(
    (keys ? keys.filter((k) => fs.existsSync(k)) : readDir(FE_OUT_DIR)).map(
      (p) => {
        const Key = p.substring(FE_OUT_DIR.length + 1);
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
      }
    )
  ).then(() => {
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
            console.log(`No need to upload ${FunctionName}, shas match.`);
          } else {
            return lambda
              .updateFunctionCode({
                FunctionName,
                Publish: true,
                ZipFile: Buffer.concat(data),
              })
              .promise()
              .then((upd) => {
                console.log(
                  `Succesfully uploaded ${FunctionName} V${upd.Version} at ${upd.LastModified}`
                );
                return waitForLambda({ Qualifier: upd.Version })
                  .then(console.log)
                  .then(() =>
                    cloudfront
                      .getDistribution({
                        Id: process.env.CLOUDFRONT_DISTRIBUTION_ID,
                      })
                      .promise()
                  )
                  .then((config) => {
                    const DistributionConfig = {
                      ...config.Distribution.DistributionConfig,
                      DefaultCacheBehavior: {
                        ...config.Distribution.DistributionConfig
                          .DefaultCacheBehavior,
                        LambdaFunctionAssociations: {
                          ...config.Distribution.DistributionConfig
                            .DefaultCacheBehavior.LambdaFunctionAssociations,
                          Items:
                            config.Distribution.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items.map(
                              (l) =>
                                l.LambdaFunctionARN.includes("origin-request")
                                  ? { ...l, LambdaFunctionARN: upd.FunctionArn }
                                  : l
                            ),
                        },
                      },
                    };
                    return cloudfront
                      .updateDistribution({
                        DistributionConfig,
                        Id: process.env.CLOUDFRONT_DISTRIBUTION_ID,
                        IfMatch: config.ETag,
                      })
                      .promise()
                      .then((r) => {
                        console.log(
                          `Updated. Current Status: ${r.Distribution.Status}`
                        );
                        return waitForCloudfront().then(console.log);
                      });
                  });
              });
          }
        })
        .catch((e) => {
          console.error(`deploy failed:`);
          console.error(e);
          process.exit(1);
        })
    );
  });
};

deployWithRemix();
