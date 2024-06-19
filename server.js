const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const { exec } = require("child_process");
const path = require("path");
require("dotenv").config();

const app = express();
const branch = "droplet";
const port = 5000;

app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const payload = req.body;
  const repositoryName = payload.repository.name;

  // Check if the pushed branch is the one we're interested in
  if (payload.ref === `refs/heads/${branch}`) {
    const baseDir = "/var/www/demo.chesscoders.com";
    const repos = {};
    repos[repositoryName] = path.join(baseDir, repositoryName);

    const token = process.env.GITHUB_TOKEN;
    const repoBaseUrl = `https://chesscoders:${token}@github.com/chesscoders`;

    const updatedRepos = [];
    const updateRepoPromises = Object.keys(repos).map((repo) => {
      const repoPath = repos[repo];
      const git = simpleGit(repoPath);

      console.log(`Updating repository: ${repo}`);
      process.chdir(repoPath);

      return git
        .checkout(branch)
        .then(() => git.fetch(`${repoBaseUrl}/${repo}.git`, branch))
        .then(() => git.pull(`${repoBaseUrl}/${repo}.git`, branch))
        .then(() => {
          console.log(`Repository ${repo} updated successfully.`);
          updatedRepos.push(repo);
        })
        .catch((err) => {
          console.error(`Failed to update ${repo}:`, err);
        });
    });

    process.chdir(baseDir);

    Promise.all(updateRepoPromises)
      .then(() => {
        const packageFiles = ["package.json", "yarn.lock", "package-lock.json"];
        const shouldRunNpmCi = payload.commits.some((commit) => {
          return commit.added
            .concat(commit.removed, commit.modified)
            .some((file) => packageFiles.includes(file));
        });

        const restartPromises = updatedRepos.map((repo) => {
          return new Promise((resolve, reject) => {
            const repoPath = repos[repo];

            const envFilePath = path.join(repoPath, ".env");
            require("dotenv").config({ path: envFilePath });
            const port = process.env.PORT;

            console.log(
              `Preparing to restart repository: ${repo} on port: ${port}`
            );

            const npmCommands = repo.includes("-api")
              ? "npm ci && npm run start -- -p " + port
              : "npm ci && npm run build && npm run start -- -p " + port;
            const npmCommand = shouldRunNpmCi
              ? npmCommands
              : repo.includes("-api")
              ? "npm run start -- -p " + port
              : "npm run build && npm run start -- -p " + port;

            if (port) {
              console.log(`Executing commands for ${repo}: ${npmCommand}`);
              exec(
                `cd ${repoPath} && ${npmCommand}`,
                (error, stdout, stderr) => {
                  if (error) {
                    console.error(
                      `Error processing commands for ${repo}: ${error}`
                    );
                    reject(error);
                    return;
                  }
                  console.log(`Command output for ${repo}: ${stdout}`);
                  console.error(`Command stderr for ${repo}: ${stderr}`);
                  resolve();
                }
              );
            } else {
              console.error(`Port not defined in .env for ${repo}`);
              reject(new Error(`Port not defined in .env for ${repo}`));
            }
          });
        });

        Promise.all(restartPromises)
          .then(() => {
            console.log("All repositories restarted successfully.");
            res.status(200).send("Webhook received and processed.");
          })
          .catch((err) => {
            console.error("Error processing restart promises:", err);
            res.status(500).send("Error processing webhook.");
          });
      })
      .catch((err) => {
        console.error("Error processing update promises:", err);
        res.status(500).send("Error processing webhook.");
      });
  } else {
    console.log(`Received push to a branch other than ${branch}. Ignoring.`);
    res.status(200).send(`Not a ${branch} branch push.`);
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
