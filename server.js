/* eslint-disable no-undef */
const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const branch = "droplet";
const port = 5000;

app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const payload = req.body;

  // Check if the pushed branch is the one we're interested in
  if (payload.ref === `refs/heads/${branch}`) {
    const baseDir = "/var/www/demo.chesscoders.com";
    const repositoryName = payload.repository.name;
    const repoPath = path.join(baseDir, repositoryName);

    const token = process.env.GITHUB_TOKEN;
    const repoBaseUrl = `https://chesscoders:${token}@github.com/chesscoders`;

    const git = simpleGit(repoPath);

    console.log(`Updating repository: ${repositoryName}`);
    process.chdir(repoPath);

    git
      .checkout(branch)
      .then(() => git.fetch(`${repoBaseUrl}/${repositoryName}.git`, branch))
      .then(() => git.pull(`${repoBaseUrl}/${repositoryName}.git`, branch))
      .then(() => {
        console.log(`Repository ${repositoryName} updated successfully.`);

        const packageFiles = ["package.json", "yarn.lock", "package-lock.json"];

        // Check if any commit affects the package files
        const shouldRunNpmCi = payload.commits.some((commit) => {
          return commit.added
            .concat(commit.removed, commit.modified)
            .some((file) => packageFiles.includes(file));
        });

        const envFilePath = path.join(repoPath, ".env");
        const envFile = fs.readFileSync(envFilePath, "utf8");
        const portMatch = envFile.match(/PORT=(\d+)/);
        const port = portMatch ? portMatch[1] : null;

        console.log(
          `Preparing to restart repository: ${repositoryName} on port: ${port}`,
        );

        // Define common command parts
        const killCommand = `ss -tulpn | grep ":${port}" | awk '{print $NF}' | cut -d',' -f2 | cut -d'=' -f2 | xargs kill -9`;
        const startCommand = `nohup npm run start -- -p ${port} > ${repoPath}/${repositoryName}.log 2>&1 &`;
        const buildCommand = `npm run build`;

        // Determine commands to run based on repo type and if npm ci should run
        const npmCiCommands = repositoryName.includes("-api")
          ? `npm ci && ${killCommand} && ${startCommand}`
          : `npm ci && ${buildCommand} && ${killCommand} && ${startCommand}`;
        const npmNoCiCommands = repositoryName.includes("-api")
          ? `${killCommand} && ${startCommand}`
          : `${buildCommand} && ${killCommand} && ${startCommand}`;

        const npmCommands = shouldRunNpmCi ? npmCiCommands : npmNoCiCommands;

        if (port) {
          console.log(
            `Executing commands for ${repositoryName}: ${npmCommands}`,
          );
          exec(npmCommands, (error, stdout, stderr) => {
            if (error) {
              console.error(
                `Error processing commands for ${repositoryName}: ${error}`,
              );
              return res
                .status(500)
                .send(
                  `Error processing commands for ${repositoryName}: ${error}`,
                );
            }
            console.log(`Command output for ${repositoryName}: ${stdout}`);
            console.error(`Command stderr for ${repositoryName}: ${stderr}`);
            res.status(200).send("Webhook received and processed.");
          });
        } else {
          console.error(`Port not defined in .env for ${repositoryName}`);
          res
            .status(500)
            .send(`Port not defined in .env for ${repositoryName}`);
        }
      })
      .catch((err) => {
        console.error(`Failed to update ${repositoryName}:`, err);
        res.status(500).send(`Failed to update ${repositoryName}: ${err}`);
      });
  } else {
    console.log(`Received push to a branch other than ${branch}. Ignoring.`);
    res.status(200).send(`Not a ${branch} branch push.`);
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
