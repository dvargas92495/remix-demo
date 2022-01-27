const dev = require("@remix-run/dev/cli/commands");

const feWithRemix = () => {
  return (
    new Promise(() => dev(process.cwd(), process.env.NODE_ENV))
  );
};

feWithRemix();
