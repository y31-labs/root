# Release branches

Production releases use one dedicated Git branch per deployable project:
`release-<project>`.

The generic `release` branch is retired. It coupled unrelated deployments, caused every Vercel
project to rebuild for the same push, and made it impossible to identify which product a release
belonged to from the Git ref alone.

## Branch map

| Project | Production branch | Release mechanism |
| --- | --- | --- |
| Austi desktop | `release-austi` | GitHub Actions builds, signs, and publishes the Tauri release |
| Austi landing | `release-austi-landing` | Vercel deploys `apps/austi-landing` to `austi.works` |
| Portfolio | `release-portfolio` | Vercel deploys `apps/portfolio` |
| Y31 / Interface Lab | `release-y31` | Vercel deploys `apps/interface-lab` |

Create a release branch only when a project has a production release target. New release branches
must follow the same `release-<project>` shape; do not recreate the generic `release` branch.

## Promotion rules

Feature work lands on `main` through a pull request first. After its checks pass, promote the tested
`main` commit to only the release branch for the product being shipped. Do not force-push release
branches and do not commit feature work directly to them.

The Austi desktop workflow owns promotion to `release-austi`, including version commits and tags.
Run **Actions → Release Austi** instead of moving that branch manually.

For a Vercel project, update its dedicated release branch from `main` after the relevant application
has been validated. Vercel's configured production branch must match the branch map above. A push to
one release branch must not deploy any other project.

Before deleting or renaming a release branch:

1. Create the replacement branch at the current production commit.
2. Update the deployment provider to use the replacement branch.
3. Verify the provider reports the new production branch.
4. Delete the obsolete branch only after no workflow or deployment project references it.
