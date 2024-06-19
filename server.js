/* eslint-disable no-console */
const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const { exec } = require("child_process");
// const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = 5000;
const branch = "droplet";

app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const payload = req.body;
  const repository = payload.repository.name;

  if (payload.ref === `refs/heads/${branch}`) {
    const baseDir = "/var/www/demo.chesscoders.com";
    const repos = {};

    // fs.readdirSync(baseDir).forEach((file) => {
    //   const fullPath = path.join(baseDir, file);
    //   if (fs.lstatSync(fullPath).isDirectory() && file !== "webhooks") {
    //     repos[file] = fullPath;
    //   }
    // });

    repos[repository] = path.join(baseDir, repository);

    const token = process.env.GITHUB_TOKEN;
    const repoBaseUrl = `https://chesscoders:${token}@github.com/chesscoders`;

    const updatedRepos = [];

    const updateRepoPromises = Object.keys(repos).map((repo) => {
      const repoPath = repos[repo];
      const git = simpleGit(repoPath);

      // Change directory to the repository
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

    // Change directory back to the base directory
    process.chdir(baseDir);

    Promise.all(updateRepoPromises)
      .then(() => {
        updatedRepos.forEach((repo) => {
          const repoPath = repos[repo];

          const envFilePath = path.join(repoPath, ".env");
          require("dotenv").config({ path: envFilePath });
          const port = process.env.PORT;

          if (port) {
            exec(
              `ss -tulpn | grep ":${port}" | awk '{print $NF}' | cut -d',' -f2 | cut -d'=' -f2 | xargs kill -9`,
              (error, stdout, stderr) => {
                if (error) {
                  console.error(
                    `Error stopping server on port ${port} for ${repo}: ${error}`
                  );
                  return;
                }
                console.log(
                  `Server on port ${port} for ${repo} stopped successfully.`
                );

                if (repo.includes("-api")) {
                  exec(
                    `cd ${repoPath} && npm ci && nohup npm run start -- -p ${port} > ${repoPath}/${repo}.log 2>&1 &`,
                    (error, stdout, stderr) => {
                      if (error) {
                        console.error(
                          `Error starting server for ${repo}: ${error}`
                        );
                        return;
                      }
                      console.log(`Start script output for ${repo}: ${stdout}`);
                    }
                  );
                } else {
                  exec(
                    `cd ${repoPath} && npm ci && npm run build && nohup npm run start -- -p ${port} > ${repoPath}/${repo}.log 2>&1 &`,
                    (error, stdout, stderr) => {
                      if (error) {
                        console.error(
                          `Error starting server for ${repo}: ${error}`
                        );
                        return;
                      }
                      console.log(`Start script output for ${repo}: ${stdout}`);
                    }
                  );
                }
              }
            );
          } else {
            console.error(`Port not defined in .env for ${repo}`);
          }
        });
        res.status(200).send("Webhook received and processed.");
      })
      .catch((err) => {
        console.error("Error processing update promises:", err);
        res.status(500).send("Error processing webhook.");
      });
  } else {
    res.status(200).send(`Not a ${branch} branch push.`);
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
