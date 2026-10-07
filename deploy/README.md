# Deployment

Production runs at https://classicguess.bevsoft.com in namespace `classicguess`, using `docker.io/bevdev1/classicguess`. The bev-deploy scaffold is configured for the cluster’s ARM64 nodes. Kubernetes manifests live in `k8s/`; Skaffold builds and pushes a Git-tagged image, then deploys it.

The Node server serves the game, bundled audio and API. There is no PVC. Postgres stores daily challenges and leaderboard results; the container uses only an ephemeral `/tmp` volume with a read-only root filesystem. A migration init container runs the transaction-safe, advisory-locked migration runner before the server starts. Readiness checks the database schema at `/api/health?ready=1`; liveness uses `/api/health`.

## Database credentials

The existing `db/postgres` StatefulSet uses username `app` and database `app`. Its password is in `db/pg-auth`, key `POSTGRES_PASSWORD`. The [Service manifest](postgres-client.yaml) exposes it at `postgres-client.db.svc.cluster.local:5432`.

Kubernetes Secrets are namespace-local. The setup helper copies the connection information into `classicguess/classicguess-app`, keeping credentials in memory and passing them through stdin. It generates the signing secret once and preserves it on subsequent runs. Live credentials are never stored in this repository.

```sh
kubectl config current-context
kubectl apply -f deploy/postgres-client.yaml
python3 scripts/configure-kubernetes-secret.py --apply
```

Password rotation requires rerunning the helper and restarting the deployment. Keep `DAILY_TOKEN_SECRET` stable so saved daily runs remain valid. The helper defaults to the existing `app` database/login; it does not create database roles.

## Release

Docker must be logged into `bevdev1`; the Docker Hub repository must be public. Traefik, cert-manager’s `letsencrypt-prod` ClusterIssuer and the host’s DNS must be available.

```sh
kubectl kustomize k8s >/dev/null
skaffold diagnose
# Commit and push the finished change before releasing.
bash ~/.claude/skills/bev-deploy/release.sh v0.1.0
```

Use a new version tag for each release. Check deployment and certificate status:

```sh
kubectl -n classicguess rollout status deployment/classicguess --timeout=5m
kubectl -n classicguess get certificate classicguess
curl --fail https://classicguess.bevsoft.com/api/health?ready=1
```

Rollback the application with `kubectl -n classicguess rollout undo deployment/classicguess`. Database migrations remain applied, so future migrations must remain compatible with the previous application version.

The anonymous leaderboard is intended for casual play. Names are not accounts; submitted histories and the public catalogue do not prove somebody listened to the clips.
